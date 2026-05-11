import { GitHubConnectorError, type GitHubFetchOptions, type GitHubRepo, type GitHubUser, type GitHubUserSearchResult } from "./types.js";

const GITHUB_API_BASE_URL = "https://api.github.com";

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
  const response = await fetchImpl(`${GITHUB_API_BASE_URL}${path}`, {
    headers: buildHeaders(options.token)
  });

  if (response.ok) {
    return (await response.json()) as T;
  }

  if (response.status === 404) {
    throw new GitHubConnectorError("GitHub profile was not found.", "not_found");
  }

  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    throw new GitHubConnectorError("GitHub API rate limit exceeded. Set GITHUB_TOKEN and retry.", "rate_limited");
  }

  throw new GitHubConnectorError(
    `GitHub API request failed with status ${response.status}.`,
    "request_failed"
  );
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
