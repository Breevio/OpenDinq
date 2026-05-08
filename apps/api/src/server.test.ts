import { describe, expect, it } from "vitest";
import { createApp } from "./server.js";

const githubUser = {
  id: 12345,
  login: "demo-agent-builder",
  name: "Demo Agent Builder",
  bio: "AI agent engineer building TypeScript MCP tools",
  location: "Remote",
  avatar_url: "https://avatars.githubusercontent.com/u/12345?v=4",
  html_url: "https://github.com/demo-agent-builder",
  public_repos: 2,
  followers: 10,
  following: 2
};

const githubRepos = [
  {
    id: 1001,
    name: "agent-tools",
    full_name: "demo-agent-builder/agent-tools",
    html_url: "https://github.com/demo-agent-builder/agent-tools",
    description: "TypeScript tools for AI agents and MCP workflows",
    fork: false,
    stargazers_count: 320,
    forks_count: 24,
    language: "TypeScript",
    topics: ["ai-agents", "mcp"],
    pushed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_at: "2025-11-01T12:00:00Z",
    archived: false,
    disabled: false
  },
  {
    id: 1002,
    name: "profile-index",
    full_name: "demo-agent-builder/profile-index",
    html_url: "https://github.com/demo-agent-builder/profile-index",
    description: "Evidence-backed profile indexing experiments",
    fork: false,
    stargazers_count: 87,
    forks_count: 7,
    language: "Python",
    topics: ["profiles", "search"],
    pushed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_at: "2025-08-10T12:00:00Z",
    archived: false,
    disabled: false
  }
];

describe("OpenDINQ API", () => {
  it("imports a GitHub profile and exposes profile, cards, and search", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const importResponse = await app.request("/api/import/github", {
      method: "POST",
      body: JSON.stringify({ input: "demo-agent-builder" }),
      headers: { "content-type": "application/json" }
    });
    expect(importResponse.status).toBe(200);
    await expect(importResponse.json()).resolves.toMatchObject({
      handle: "demo-agent-builder",
      cardCount: 3,
      artifactCount: 2
    });

    const profileResponse = await app.request("/api/people/demo-agent-builder");
    expect(profileResponse.status).toBe(200);
    await expect(profileResponse.json()).resolves.toMatchObject({
      person: {
        handle: "demo-agent-builder",
        displayName: "Demo Agent Builder"
      },
      artifacts: expect.any(Array),
      cards: expect.any(Array)
    });

    const cardsResponse = await app.request("/api/cards/demo-agent-builder");
    expect(cardsResponse.status).toBe(200);
    await expect(cardsResponse.json()).resolves.toMatchObject({
      handle: "demo-agent-builder",
      cards: expect.arrayContaining([
        expect.objectContaining({
          type: "github",
          evidence: expect.any(Array)
        })
      ])
    });

    const noteResponse = await app.request("/api/cards/demo-agent-builder/note", {
      method: "POST",
      body: JSON.stringify({ title: "Availability note", contentMd: "Interested in agent tooling." }),
      headers: { "content-type": "application/json" }
    });
    expect(noteResponse.status).toBe(201);
    await expect(noteResponse.json()).resolves.toMatchObject({
      handle: "demo-agent-builder",
      card: {
        type: "note",
        evidence: expect.arrayContaining([expect.objectContaining({ type: "external" })])
      }
    });

    const searchResponse = await app.request("/api/search?q=AI%20agent%20TypeScript%20MCP");
    expect(searchResponse.status).toBe(200);
    const searchJson = await searchResponse.json();
    expect(searchJson.results[0]).toMatchObject({
      person: {
        handle: "demo-agent-builder"
      },
      explanation: expect.stringContaining("MCP"),
      evidence: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })])
    });
  });

  it("returns typed validation and not-found errors", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const badImportResponse = await app.request("/api/import/github", {
      method: "POST",
      body: JSON.stringify({ input: "" }),
      headers: { "content-type": "application/json" }
    });
    expect(badImportResponse.status).toBe(400);

    const missingProfileResponse = await app.request("/api/people/missing");
    expect(missingProfileResponse.status).toBe(404);
    await expect(missingProfileResponse.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Person was not found."
      }
    });
  });

  it("seeds demo profiles without calling external APIs", async () => {
    const app = createApp();

    const seedResponse = await app.request("/api/seed/demo", { method: "POST" });
    expect(seedResponse.status).toBe(200);
    await expect(seedResponse.json()).resolves.toMatchObject({
      profileCount: 3,
      handles: expect.arrayContaining(["demo-agent-builder", "demo-systems-maintainer", "demo-ml-researcher"])
    });

    const searchResponse = await app.request("/api/search?q=systems%20programming%20open%20source%20maintainers");
    expect(searchResponse.status).toBe(200);
    const searchJson = await searchResponse.json();
    expect(searchJson.results[0].person.handle).toBe("demo-systems-maintainer");
    expect(searchJson.results[0].evidence.length).toBeGreaterThan(0);
  });
});

async function fixtureFetch(url: string | URL | Request) {
  const textUrl = String(url);

  if (textUrl.endsWith("/repos?per_page=100&sort=updated&type=owner")) {
    return Response.json(githubRepos);
  }

  return Response.json(githubUser);
}
