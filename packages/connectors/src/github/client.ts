import { GitHubConnectorError, type GitHubFetchOptions, type GitHubRepo, type GitHubUser, type GitHubUserSearchResult } from "./types.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_CACHE_TTL_MS = 60_000;
const GITHUB_STALE_CACHE_TTL_MS = 10 * 60_000;
const GITHUB_ANONYMOUS_RATE_LIMIT_COOLDOWN_MS = 60_000;
const githubResponseCache = new WeakMap<typeof fetch, Map<string, { expiresAt: number; value: unknown }>>();
const githubInFlightRequests = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>();
const githubRateLimitCooldowns = new WeakMap<typeof fetch, Map<string, { expiresAt: number; error: GitHubConnectorError }>>();

export async function fetchGitHubUser(
  username: string,
  tokenOrOptions?: string | GitHubFetchOptions
): Promise<GitHubUser> {
  return requestGitHub<GitHubUser>(
    `/users/${encodeURIComponent(username)}`,
    normalizeOptions(tokenOrOptions)
  );
}

export async function fetchGitHubRepos(
  username: string,
  tokenOrOptions?: string | GitHubFetchOptions
): Promise<GitHubRepo[]> {
  return requestGitHub<GitHubRepo[]>(
    `/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`,
    normalizeOptions(tokenOrOptions)
  );
}

export async function searchGitHubUsers(
  query: string,
  tokenOrOptions?: string | GitHubFetchOptions
): Promise<NonNullable<GitHubUserSearchResult["items"]>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const params = new URLSearchParams({
    q: `${trimmed} type:user in:login in:name`,
    per_page: "5"
  });
  const result = await requestGitHub<GitHubUserSearchResult>(
    `/search/users?${params.toString()}`,
    normalizeOptions(tokenOrOptions)
  );
  return result.items ?? [];
}

async function requestGitHub<T>(path: string, options: GitHubFetchOptions): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = githubCacheKey(path, options.token);
  const rateLimitKey = githubRateLimitKey(options.token);
  const cooldownError = readRateLimitCooldown(fetchImpl, rateLimitKey);
  if (cooldownError) {
    const stale = !options.token ? readGitHubCacheByFreshness<T>(fetchImpl, cacheKey, "stale") : undefined;
    if (stale !== undefined) {
      return stale;
    }
    throw cooldownError;
  }
  const cached = readGitHubCacheByFreshness<T>(fetchImpl, cacheKey, "fresh");
  if (cached !== undefined) {
    return cached;
  }

  const inFlight = readInFlightRequest<T>(fetchImpl, cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = requestGitHubUncached<T>(fetchImpl, path, options.token, cacheKey);
  writeInFlightRequest(fetchImpl, cacheKey, request);
  return request;
}

async function requestGitHubUncached<T>(
  fetchImpl: typeof fetch,
  path: string,
  token: string | undefined,
  cacheKey: string
): Promise<T> {
  try {
    const response = await fetchImpl(`${GITHUB_API_BASE_URL}${path}`, {
      headers: buildHeaders(token)
    });

    if (response.ok) {
      const value = (await response.json()) as T;
      writeGitHubCache(fetchImpl, cacheKey, value);
      return value;
    }

    if (response.status === 404) {
      throw new GitHubConnectorError("GitHub profile was not found.", "not_found");
    }

    if (isGitHubRateLimited(response)) {
      const error = new GitHubConnectorError("GitHub API rate limit exceeded. Set GITHUB_TOKEN and retry.", "rate_limited");
      const cooldownMs = rateLimitCooldownMs(response) ?? (!token ? GITHUB_ANONYMOUS_RATE_LIMIT_COOLDOWN_MS : undefined);
      if (cooldownMs !== undefined) {
        writeRateLimitCooldown(fetchImpl, githubRateLimitKey(token), error, cooldownMs);
      }
      throw error;
    }

    throw new GitHubConnectorError(
      `GitHub API request failed with status ${response.status}.`,
      "request_failed"
    );
  } finally {
    clearInFlightRequest(fetchImpl, cacheKey);
  }
}

function buildHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    accept: "application/vnd.github+json",
    "user-agent": "opendinq"
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

function normalizeOptions(tokenOrOptions?: string | GitHubFetchOptions): GitHubFetchOptions {
  if (!tokenOrOptions) {
    return {};
  }

  if (typeof tokenOrOptions === "string") {
    return { token: tokenOrOptions };
  }

  return tokenOrOptions;
}

function githubCacheKey(path: string, token: string | undefined): string {
  return `${token ?? "anonymous"}:${path}`;
}

function githubRateLimitKey(token: string | undefined): string {
  return token ?? "anonymous";
}

function readGitHubCache<T>(fetchImpl: typeof fetch, key: string): T | undefined {
  return readGitHubCacheByFreshness(fetchImpl, key, "fresh");
}

function readGitHubCacheByFreshness<T>(fetchImpl: typeof fetch, key: string, freshness: "fresh" | "stale"): T | undefined {
  const cache = githubResponseCache.get(fetchImpl);
  const cached = cache?.get(key);
  if (!cached) {
    return undefined;
  }
  const now = Date.now();
  if (cached.expiresAt <= now) {
    if (freshness === "stale" && cached.expiresAt + GITHUB_STALE_CACHE_TTL_MS > now) {
      return cached.value as T;
    }
    if (cached.expiresAt + GITHUB_STALE_CACHE_TTL_MS <= now) {
      cache?.delete(key);
    }
    return undefined;
  }
  return cached.value as T;
}

function writeGitHubCache(fetchImpl: typeof fetch, key: string, value: unknown) {
  const cache = ensureWeakMapValue(githubResponseCache, fetchImpl);
  cache.set(key, {
    value,
    expiresAt: Date.now() + GITHUB_CACHE_TTL_MS
  });
}

function readRateLimitCooldown(fetchImpl: typeof fetch, key: string): GitHubConnectorError | undefined {
  const cooldowns = githubRateLimitCooldowns.get(fetchImpl);
  const cooldown = cooldowns?.get(key);
  if (!cooldown) {
    return undefined;
  }
  if (cooldown.expiresAt <= Date.now()) {
    cooldowns?.delete(key);
    return undefined;
  }
  return cooldown.error;
}

function writeRateLimitCooldown(
  fetchImpl: typeof fetch,
  key: string,
  error: GitHubConnectorError,
  durationMs: number
) {
  const cooldowns = ensureWeakMapValue(githubRateLimitCooldowns, fetchImpl);
  cooldowns.set(key, {
    error,
    expiresAt: Date.now() + durationMs
  });
}

function readInFlightRequest<T>(fetchImpl: typeof fetch, key: string): Promise<T> | undefined {
  const requests = githubInFlightRequests.get(fetchImpl);
  return requests?.get(key) as Promise<T> | undefined;
}

function writeInFlightRequest(fetchImpl: typeof fetch, key: string, request: Promise<unknown>) {
  const requests = ensureWeakMapValue(githubInFlightRequests, fetchImpl);
  requests.set(key, request);
}

function clearInFlightRequest(fetchImpl: typeof fetch, key: string) {
  githubInFlightRequests.get(fetchImpl)?.delete(key);
}

function isGitHubRateLimited(response: Response): boolean {
  return response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
}

function rateLimitCooldownMs(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  const resetAtSeconds = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(resetAtSeconds) && resetAtSeconds > 0) {
    const resetDelayMs = resetAtSeconds * 1000 - Date.now();
    if (resetDelayMs > 0) {
      return resetDelayMs;
    }
  }

  return undefined;
}

function ensureWeakMapValue<T>(map: WeakMap<typeof fetch, Map<string, T>>, fetchImpl: typeof fetch): Map<string, T> {
  const existing = map.get(fetchImpl);
  if (existing) {
    return existing;
  }
  const created = new Map<string, T>();
  map.set(fetchImpl, created);
  return created;
}
