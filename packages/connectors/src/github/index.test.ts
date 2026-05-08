import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fetchGitHubRepos,
  fetchGitHubUser,
  GitHubConnectorError,
  normalizeGitHubReposToArtifacts,
  normalizeGitHubUserToIdentitySource,
  normalizeGitHubUserToPerson,
  parseGitHubProfileUrl,
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
      new GitHubConnectorError("GitHub API rate limit exceeded. Set GITHUB_TOKEN and retry.", "rate_limited")
    );
  });
});

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as T;
}

