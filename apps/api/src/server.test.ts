import { describe, expect, it, vi } from "vitest";
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

describe("OpenDinq API", () => {
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
      cardCount: expect.any(Number),
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
          type: "works",
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

    const manualNoteResponse = await app.request("/api/people/demo-agent-builder/cards/manual-note", {
      method: "POST",
      body: JSON.stringify({ title: "Product note", contentMd: "Manual evidence about product design." }),
      headers: { "content-type": "application/json" }
    });
    expect(manualNoteResponse.status).toBe(201);
    const manualNoteJson = await manualNoteResponse.json();
    expect(manualNoteJson.card).toMatchObject({
      id: expect.any(String),
      type: "note",
      visibility: "public"
    });

    const patchResponse = await app.request(`/api/cards/${manualNoteJson.card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hidden product note", visibility: "hidden", ignored: true }),
      headers: { "content-type": "application/json" }
    });
    expect(patchResponse.status).toBe(400);

    const validPatchResponse = await app.request(`/api/cards/${manualNoteJson.card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hidden product note", visibility: "hidden", order: 99 }),
      headers: { "content-type": "application/json" }
    });
    expect(validPatchResponse.status).toBe(200);
    await expect(validPatchResponse.json()).resolves.toMatchObject({
      card: {
        id: manualNoteJson.card.id,
        title: "Hidden product note",
        visibility: "hidden",
        order: 99
      }
    });

    const publicCardsResponse = await app.request("/api/people/demo-agent-builder/cards");
    expect(publicCardsResponse.status).toBe(200);
    const publicCardsJson = await publicCardsResponse.json();
    expect(publicCardsJson.cards.map((card: { id?: string }) => card.id)).not.toContain(manualNoteJson.card.id);

    const workspaceResponse = await app.request("/api/people/demo-agent-builder/workspace");
    expect(workspaceResponse.status).toBe(200);
    const workspaceJson = await workspaceResponse.json();
    expect(workspaceJson.readiness.score).toEqual(expect.any(Number));
    expect(workspaceJson.profile.cards.map((card: { id?: string }) => card.id)).toContain(manualNoteJson.card.id);

    const claimsResponse = await app.request("/api/people/demo-agent-builder/claims");
    expect(claimsResponse.status).toBe(200);
    const claimsJson = await claimsResponse.json();
    const claimId = claimsJson.claims[0].id;
    expect(claimId).toEqual(expect.any(String));

    const rejectClaimResponse = await app.request(`/api/claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "rejected" }),
      headers: { "content-type": "application/json" }
    });
    expect(rejectClaimResponse.status).toBe(200);
    await expect(rejectClaimResponse.json()).resolves.toMatchObject({ claim: { id: claimId, status: "rejected" } });

    const publicProfileAfterReject = await app.request("/api/people/demo-agent-builder");
    const publicAfterRejectJson = await publicProfileAfterReject.json();
    expect(publicAfterRejectJson.claims.map((claim: { id?: string }) => claim.id)).not.toContain(claimId);

    const regenerateResponse = await app.request(`/api/cards/${publicCardsJson.cards[0].id}/regenerate`, { method: "POST" });
    expect(regenerateResponse.status).toBe(200);
    await expect(regenerateResponse.json()).resolves.toMatchObject({
      card: {
        id: publicCardsJson.cards[0].id,
        evidence: expect.any(Array)
      }
    });

    const publishResponse = await app.request("/api/people/demo-agent-builder/publish", {
      method: "PATCH",
      body: JSON.stringify({ publicStatus: "published" }),
      headers: { "content-type": "application/json" }
    });
    expect(publishResponse.status).toBe(200);
    await expect(publishResponse.json()).resolves.toMatchObject({
      profile: {
        person: {
          publicStatus: "published"
        }
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
      evidence: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
      matchedArtifacts: expect.arrayContaining([expect.objectContaining({ title: expect.stringContaining("agent-tools") })]),
      topSkills: expect.arrayContaining(["TypeScript"]),
      profileUrl: "/u/demo-agent-builder"
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
      profileCount: 4,
      handles: expect.arrayContaining(["demo-agent-builder", "demo-product-designer", "demo-systems-maintainer", "demo-ml-researcher"])
    });

    const searchResponse = await app.request("/api/search?q=systems%20programming%20open%20source%20maintainers");
    expect(searchResponse.status).toBe(200);
    const searchJson = await searchResponse.json();
    expect(searchJson.results[0].person.handle).toBe("demo-systems-maintainer");
    expect(searchJson.results[0].evidence.length).toBeGreaterThan(0);
  });

  it("generates profiles through the first-class profile generator", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const githubResponse = await app.request("/api/profiles/generate", {
      method: "POST",
      body: JSON.stringify({
        sources: [{ type: "github", input: "demo-agent-builder" }]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(githubResponse.status).toBe(200);
    const githubJson = await githubResponse.json();
    expect(githubJson).toMatchObject({
      handle: "demo-agent-builder",
      status: "completed",
      profileUrl: "/u/demo-agent-builder",
      artifactsImported: 2
    });
    expect(githubJson.cardsGenerated).toBeGreaterThanOrEqual(3);
    expect(githubJson.claimsGenerated).toBeGreaterThan(0);

    const runResponse = await app.request(`/api/profile-runs/${githubJson.runId}`);
    expect(runResponse.status).toBe(200);
    await expect(runResponse.json()).resolves.toMatchObject({
      handle: "demo-agent-builder",
      artifactsCount: 2,
      claimsCount: expect.any(Number)
    });
  });

  it("supports manual-only and website plus manual generation with evidence", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const manualResponse = await app.request("/api/profiles/generate", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Manual Builder",
        handle: "manual-builder",
        headline: "Builds public profile cards",
        sources: [
          {
            type: "manual",
            input: {
              title: "Built MCP tools",
              url: "https://example.com/project",
              note: "Built MCP tools for profile automation."
            }
          }
        ]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(manualResponse.status).toBe(200);
    const manualJson = await manualResponse.json();
    expect(manualJson.claimsGenerated).toBeGreaterThan(0);

    const combinedResponse = await app.request("/api/profiles/generate", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Website Builder",
        handle: "website-builder",
        sources: [
          { type: "website", input: "https://example.com" },
          { type: "manual", input: { note: "Maintains public project notes." } }
        ]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(combinedResponse.status).toBe(200);

    const profileResponse = await app.request("/api/people/website-builder");
    const profileJson = await profileResponse.json();
    expect(profileJson.claims.every((claim: { evidence: unknown[] }) => claim.evidence.length > 0)).toBe(true);
    expect(profileJson.cards.every((card: { type: string; evidence: unknown[] }) => card.type === "note" || card.evidence.length > 0)).toBe(true);
  });

  it("keeps generation reviewable when one connector fails", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/generate", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Partial Builder",
        handle: "partial-builder",
        sources: [
          { type: "website", input: "https://example.com" },
          { type: "github", input: "-bad-user" }
        ]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("needs_review");
    expect(json.warnings[0]).toContain("github");
  });

  it("adds public multi-source artifacts to an existing profile", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    await app.request("/api/seed/demo", { method: "POST" });

    const manualResponse = await app.request("/api/people/demo-agent-builder/artifacts", {
      method: "POST",
      body: JSON.stringify({
        type: "project",
        title: "Agent evaluation dashboard",
        description: "Manual evidence for MCP and AI agent evaluation.",
        url: "https://example.com/agent-eval"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(manualResponse.status).toBe(201);

    const websiteResponse = await app.request("/api/import/website", {
      method: "POST",
      body: JSON.stringify({ handle: "demo-agent-builder", url: "https://example.com" }),
      headers: { "content-type": "application/json" }
    });
    expect(websiteResponse.status).toBe(200);

    const openAlexResponse = await app.request("/api/import/openalex", {
      method: "POST",
      body: JSON.stringify({ handle: "demo-agent-builder", input: "A123456789" }),
      headers: { "content-type": "application/json" }
    });
    expect(openAlexResponse.status).toBe(200);

    const arxivResponse = await app.request("/api/import/arxiv", {
      method: "POST",
      body: JSON.stringify({ handle: "demo-agent-builder", input: "2601.01234" }),
      headers: { "content-type": "application/json" }
    });
    expect(arxivResponse.status).toBe(200);

    const orcidResponse = await app.request("/api/import/orcid", {
      method: "POST",
      body: JSON.stringify({ handle: "demo-agent-builder", input: "0000-0002-1825-0097" }),
      headers: { "content-type": "application/json" }
    });
    expect(orcidResponse.status).toBe(200);

    const profileResponse = await app.request("/api/people/demo-agent-builder");
    const profileJson = await profileResponse.json();
    expect(profileJson.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "website" }),
        expect.objectContaining({ type: "openalex" }),
        expect.objectContaining({ type: "arxiv" }),
        expect.objectContaining({ type: "orcid" })
      ])
    );
    expect(profileJson.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "project", title: "Agent evaluation dashboard" }),
        expect.objectContaining({ type: "website", title: "Example Portfolio" }),
        expect.objectContaining({ type: "paper", title: "Agent systems paper" }),
        expect.objectContaining({ type: "paper", title: "Agent Search Systems" }),
        expect.objectContaining({ type: "paper", title: "Open profile indexing" })
      ])
    );
  });

  it("plans profile generation with deterministic fallback when LLM is not configured", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/plan", {
      method: "POST",
      body: JSON.stringify({ input: "https://github.com/torvalds" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      llmUsed: false,
      plan: {
        sources: [expect.objectContaining({ type: "github", input: "torvalds" })]
      },
      warnings: expect.arrayContaining([expect.stringContaining("LLM generation is not configured")])
    });
  });

  it("generates an AI profile from a single input and synthesizes evidence-backed claims", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          rawInput: "https://github.com/demo-agent-builder",
          intent: "generate_profile",
          confidence: 0.95,
          inferredPerson: { handle: "demo-agent-builder" },
          sources: [{ type: "github", input: "demo-agent-builder", reason: "GitHub URL provided.", confidence: 0.95 }],
          manualNotes: [],
          searchQueries: [],
          warnings: [],
          questions: []
        })
        .mockResolvedValueOnce([
          { type: "project", text: "Builds TypeScript MCP tools for AI agent workflows", confidence: 0.92, evidenceRefs: [{ id: "https://github.com/demo-agent-builder/agent-tools" }] },
          { type: "skill", text: "No evidence claim", confidence: 0.9, evidenceRefs: [{ id: "missing" }] }
        ])
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/generate-ai", {
      method: "POST",
      body: JSON.stringify({ input: "https://github.com/demo-agent-builder" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      handle: "demo-agent-builder",
      llmUsed: true,
      workspaceUrl: "/u/demo-agent-builder/workspace",
      plan: { intent: "generate_profile" }
    });
    expect(json.claimsGenerated).toBeGreaterThan(0);

    const claimsResponse = await app.request("/api/people/demo-agent-builder/claims");
    const claimsJson = await claimsResponse.json();
    expect(claimsJson.claims.map((claim: { text: string }) => claim.text)).toContain("Builds TypeScript MCP tools for AI agent workflows");
    expect(claimsJson.claims.map((claim: { text: string }) => claim.text)).not.toContain("No evidence claim");
  });
});

async function fixtureFetch(url: string | URL | Request) {
  const textUrl = String(url);

  if (textUrl === "https://example.com/") {
    return new Response(`
      <html>
        <head>
          <meta property="og:title" content="Example Portfolio" />
          <meta name="description" content="Public project notes." />
        </head>
      </html>
    `);
  }

  if (textUrl.endsWith("/authors/A123456789")) {
    return Response.json({
      id: "https://openalex.org/A123456789",
      display_name: "Demo Agent Builder"
    });
  }

  if (textUrl.startsWith("https://api.openalex.org/works")) {
    return Response.json({
      results: [
        {
          id: "https://openalex.org/W1",
          display_name: "Agent systems paper",
          publication_year: 2026,
          cited_by_count: 42,
          primary_location: { landing_page_url: "https://doi.org/10.1/example" },
          concepts: [{ display_name: "AI agents" }]
        }
      ]
    });
  }

  if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
    return new Response(`
      <feed>
        <entry>
          <id>https://arxiv.org/abs/2601.01234</id>
          <title>Agent Search Systems</title>
          <summary>Evidence-backed people search.</summary>
          <published>2026-01-02T00:00:00Z</published>
          <updated>2026-01-03T00:00:00Z</updated>
          <author><name>Ethan Shi</name></author>
          <category term="cs.AI" />
        </entry>
      </feed>
    `);
  }

  if (textUrl.endsWith("/0000-0002-1825-0097/record")) {
    return Response.json({
      "orcid-identifier": {
        path: "0000-0002-1825-0097",
        uri: "https://orcid.org/0000-0002-1825-0097"
      },
      "activities-summary": {
        works: {
          group: [
            {
              "work-summary": [
                {
                  title: { title: { value: "Open profile indexing" } },
                  "publication-date": { year: { value: "2026" } },
                  url: { value: "https://example.com/paper" }
                }
              ]
            }
          ]
        }
      }
    });
  }

  if (textUrl.endsWith("/repos?per_page=100&sort=updated&type=owner")) {
    return Response.json(githubRepos);
  }

  return Response.json(githubUser);
}
