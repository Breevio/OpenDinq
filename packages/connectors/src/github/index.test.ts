import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  fetchGitHubRepos,
  fetchGitHubUser,
  GitHubConnectorError,
  normalizeGitHubReposToArtifacts,
  normalizeGitHubUserToIdentitySource,
  normalizeGitHubUserToPerson,
  parseGitHubProfileUrl,
  searchGitHubUsers,
  type GitHubRepo,
  type GitHubUser
} from "./index.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

describe("parseGitHubProfileUrl", () => {
  it("parses usernames and profile URLs", () => {
    expect(parseGitHubProfileUrl("torvalds")).toBe("torvalds");
    expect(parseGitHubProfileUrl("@torvalds")).toBe("torvalds");
    expect(parseGitHubProfileUrl("github.com/vercel/next.js")).toBe("vercel");
    expect(parseGitHubProfileUrl("https://www.github.com/openai")).toBe("openai");
  });

  it("rejects invalid input clearly", () => {
    expect(() => parseGitHubProfileUrl("https://example.com/openai")).toThrow(
      "Input must be a GitHub profile URL or username."
    );
    expect(() => parseGitHubProfileUrl("-bad-user")).toThrow("GitHub username is invalid.");
  });
});

describe("GitHub normalization", () => {
  const user = readFixture<GitHubUser>("user.json");
  const repos = readFixture<GitHubRepo[]>("repos.json");

  it("normalizes a GitHub user to a person", () => {
    expect(normalizeGitHubUserToPerson(user)).toEqual({
      handle: "demo-agent-builder",
      displayName: "Demo Agent Builder",
      headline: "AI agent engineer building TypeScript MCP tools",
      bio: "AI agent engineer building TypeScript MCP tools",
      location: "San Francisco, CA",
      avatarUrl: "https://avatars.githubusercontent.com/u/12345?v=4"
    });
  });

  it("normalizes a GitHub user to an identity source", () => {
    expect(normalizeGitHubUserToIdentitySource(user)).toMatchObject({
      type: "github",
      url: "https://github.com/demo-agent-builder",
      externalId: "12345"
    });
  });

  it("normalizes repos to artifacts with impact metadata", () => {
    expect(normalizeGitHubReposToArtifacts(repos)).toEqual([
      expect.objectContaining({
        type: "repo",
        title: "demo-agent-builder/agent-tools",
        url: "https://github.com/demo-agent-builder/agent-tools",
        metadata: expect.objectContaining({
          stars: 320,
          forks: 24,
          language: "TypeScript",
          topics: ["ai-agents", "mcp", "typescript"],
          pushedAt: "2026-04-20T12:00:00Z",
          updatedAt: "2026-04-21T12:00:00Z"
        })
      }),
      expect.objectContaining({
        title: "demo-agent-builder/profile-index",
        metadata: expect.objectContaining({
          language: "Python"
        })
      })
    ]);
  });
});

describe("GitHub API client", () => {
  it("fetches users and repos with optional token headers", async () => {
    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers });
      return Response.json(url.toString().includes("/repos") ? [] : readFixture<GitHubUser>("user.json"));
    };

    await expect(fetchGitHubUser("demo-agent-builder", { fetchImpl, token: "token" })).resolves.toMatchObject({
      login: "demo-agent-builder"
    });
    await expect(fetchGitHubRepos("demo-agent-builder", { fetchImpl })).resolves.toEqual([]);
    expect(calls[0]?.url).toBe("https://api.github.com/users/demo-agent-builder");
    expect(calls[0]?.headers).toMatchObject({ authorization: "Bearer token" });
    expect(calls[1]?.url).toBe(
      "https://api.github.com/users/demo-agent-builder/repos?per_page=100&sort=updated&type=owner"
    );
  });

  it("reuses successful responses for identical requests within the same fetch implementation", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      return Response.json(url.toString().includes("/repos") ? [] : readFixture<GitHubUser>("user.json"));
    });

    await fetchGitHubUser("demo-agent-builder", { fetchImpl });
    await fetchGitHubUser("demo-agent-builder", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent identical requests", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));

    const userRequestA = fetchGitHubUser("demo-agent-builder", { fetchImpl });
    const userRequestB = fetchGitHubUser("demo-agent-builder", { fetchImpl });
    resolveResponse?.(Response.json(readFixture<GitHubUser>("user.json")));

    await expect(Promise.all([userRequestA, userRequestB])).resolves.toEqual([
      expect.objectContaining({ login: "demo-agent-builder" }),
      expect.objectContaining({ login: "demo-agent-builder" })
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("searches GitHub users", async () => {
    const users = await searchGitHubUsers("Jiajun Wu", {
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe("https://api.github.com/search/users?q=Jiajun+Wu+type%3Auser+in%3Alogin+in%3Aname&per_page=5");
        expect(init?.headers).toMatchObject({ accept: "application/vnd.github+json" });
        return Response.json({
          items: [
            {
              login: "jiajun-wu",
              id: 501,
              html_url: "https://github.com/jiajun-wu",
              type: "User"
            }
          ]
        });
      }
    });

    expect(users[0]).toMatchObject({
      login: "jiajun-wu",
      html_url: "https://github.com/jiajun-wu"
    });
  });

  it("maps not found and rate-limit responses to typed errors", async () => {
    await expect(
      fetchGitHubUser("missing", {
        fetchImpl: async () => new Response("not found", { status: 404 })
      })
    ).rejects.toMatchObject(new GitHubConnectorError("GitHub profile was not found.", "not_found"));

    await expect(
      fetchGitHubUser("limited", {
        fetchImpl: async () =>
          new Response("rate limited", {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" }
          })
      })
    ).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );
  });

  it("applies a conservative anonymous cooldown when GitHub omits retry headers", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" }
      })
    );

    await expect(fetchGitHubUser("limited", { fetchImpl })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );
    await expect(fetchGitHubUser("limited", { fetchImpl })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not invent a cooldown for tokened rate limits when GitHub omits retry headers", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" }
      })
    );

    await expect(fetchGitHubUser("limited", { fetchImpl, token: "token" })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );
    await expect(fetchGitHubUser("limited", { fetchImpl, token: "token" })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("short-circuits repeated requests during a GitHub rate-limit cooldown", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "retry-after": "60" }
      })
    );

    await expect(fetchGitHubUser("limited", { fetchImpl })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );
    await expect(fetchGitHubRepos("limited", { fetchImpl })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries GitHub requests after the rate-limit cooldown expires", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-29T00:00:00Z");
    vi.setSystemTime(now);
    const fetchImpl = vi.fn(async () =>
      new Response("rate limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "retry-after": "1" }
      })
    );

    await expect(fetchGitHubUser("limited", { fetchImpl })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );

    vi.advanceTimersByTime(1001);

    await expect(fetchGitHubUser("limited", { fetchImpl })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reuses stale anonymous successes during a temporary rate-limit cooldown", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-29T00:00:00Z");
    vi.setSystemTime(now);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/users/demo-agent-builder/repos")) {
        return new Response("rate limited", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" }
        });
      }
      return Response.json(readFixture<GitHubUser>("user.json"));
    });

    await expect(fetchGitHubUser("demo-agent-builder", { fetchImpl })).resolves.toMatchObject({
      login: "demo-agent-builder"
    });
    vi.advanceTimersByTime(61_000);

    await expect(fetchGitHubRepos("demo-agent-builder", { fetchImpl })).rejects.toMatchObject(
      new GitHubConnectorError("GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness.", "rate_limited")
    );
    await expect(fetchGitHubUser("demo-agent-builder", { fetchImpl })).resolves.toMatchObject({
      login: "demo-agent-builder"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as T;
}
