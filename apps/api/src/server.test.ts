import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@opendinq/core";
import { createProfileGenerator } from "./profile-generator.js";
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

const elonmuskGithubUser = {
  ...githubUser,
  id: 42,
  login: "elonmusk",
  name: "elonmusk",
  bio: "Public GitHub profile",
  html_url: "https://github.com/elonmusk"
};

const elonmuskGithubRepos = [
  {
    ...githubRepos[0]!,
    id: 4201,
    name: "agent-tools",
    full_name: "elonmusk/agent-tools",
    html_url: "https://github.com/elonmusk/agent-tools",
    description: "Public repository evidence for profile cards"
  },
  {
    ...githubRepos[1]!,
    id: 4202,
    name: "profile-index",
    full_name: "elonmusk/profile-index",
    html_url: "https://github.com/elonmusk/profile-index",
    description: "Public profile indexing repository"
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
      status: "completed",
      cardCount: expect.any(Number),
      artifactCount: 3,
      warnings: [],
      workspaceUrl: "/u/demo-agent-builder/workspace",
      profileUrl: "/u/demo-agent-builder"
    });

    const profileResponse = await app.request("/api/people/demo-agent-builder");
    expect(profileResponse.status).toBe(200);
    const publicProfileJson = await profileResponse.json();
    expect(publicProfileJson).toMatchObject({
      person: {
        handle: "demo-agent-builder",
        displayName: "Demo Agent Builder"
      },
      artifacts: expect.any(Array),
      cards: expect.any(Array)
    });
    expect(publicProfileJson.sources[0]).not.toHaveProperty("rawJson");
    expect(publicProfileJson.artifacts[0]).not.toHaveProperty("evidenceRaw");
    expect(JSON.stringify(publicProfileJson.cards)).not.toContain("evidenceRaw");
    expect(JSON.stringify(publicProfileJson.cards)).not.toContain("rawJson");
    expect(JSON.stringify(publicProfileJson.cards)).not.toContain("normalizedJson");

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

    const privateNoteResponse = await app.request("/api/people/demo-agent-builder/cards/manual-note", {
      method: "POST",
      body: JSON.stringify({ title: "Private product note", contentMd: "Private manual note about product design." }),
      headers: { "content-type": "application/json" }
    });
    expect(privateNoteResponse.status).toBe(201);
    const privateNoteJson = await privateNoteResponse.json();
    const privatePatchResponse = await app.request(`/api/cards/${privateNoteJson.card.id}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility: "private" }),
      headers: { "content-type": "application/json" }
    });
    expect(privatePatchResponse.status).toBe(200);

    const publicProfileWithPrivateCard = await app.request("/api/people/demo-agent-builder");
    const publicProfileWithPrivateCardJson = await publicProfileWithPrivateCard.json();
    expect(publicProfileWithPrivateCardJson.cards.map((card: { id?: string }) => card.id)).not.toContain(privateNoteJson.card.id);

    const workspaceResponse = await app.request("/api/people/demo-agent-builder/workspace");
    expect(workspaceResponse.status).toBe(200);
    const workspaceJson = await workspaceResponse.json();
    expect(workspaceJson.readiness.score).toEqual(expect.any(Number));
    expect(workspaceJson.readiness.checks.map((check: { label: string }) => check.label)).toEqual([
      "Add a public source",
      "Review highlighted details",
      "Show key profile cards",
      "Add a clear headline",
      "Add a profile note",
      "Attach supporting evidence"
    ]);
    expect(workspaceJson.discoverQuery).toBe("AI agent engineer building TypeScript MCP tools Python");
    expect(workspaceJson.discoverQuery).not.toContain("TypeScript TypeScript");
    expect(workspaceJson.discoverQuery).not.toContain("MCP MCP");
    expect(workspaceJson.discoverQuery).not.toContain("Python Python");
    expect(workspaceJson.profile.sources[0]).not.toHaveProperty("rawJson");
    expect(workspaceJson.profile.artifacts[0]).not.toHaveProperty("evidenceRaw");
    expect(JSON.stringify(workspaceJson.profile.cards)).not.toContain("evidenceRaw");
    expect(JSON.stringify(workspaceJson.publicProfile.cards)).not.toContain("evidenceRaw");
    expect(workspaceJson.profileSources[0]).not.toHaveProperty("rawJson");
    expect(workspaceJson.profileSources[0]).not.toHaveProperty("normalizedJson");
    expect(workspaceJson.profile.cards.map((card: { id?: string }) => card.id)).toContain(manualNoteJson.card.id);
    expect(workspaceJson.profile.cards.map((card: { id?: string }) => card.id)).toContain(privateNoteJson.card.id);

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

    const publicClaimsAfterReject = await app.request("/api/people/demo-agent-builder/claims");
    const publicClaimsAfterRejectJson = await publicClaimsAfterReject.json();
    expect(publicClaimsAfterRejectJson.claims.map((claim: { id?: string }) => claim.id)).not.toContain(claimId);

    const pendingClaimId = publicClaimsAfterRejectJson.claims[0].id;
    const pendingClaimResponse = await app.request(`/api/claims/${pendingClaimId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "pending" }),
      headers: { "content-type": "application/json" }
    });
    expect(pendingClaimResponse.status).toBe(200);
    await expect(pendingClaimResponse.json()).resolves.toMatchObject({ claim: { id: pendingClaimId, status: "pending" } });

    const publicProfileAfterPending = await app.request("/api/people/demo-agent-builder");
    const publicProfileAfterPendingJson = await publicProfileAfterPending.json();
    expect(publicProfileAfterPendingJson.claims.map((claim: { id?: string }) => claim.id)).not.toContain(pendingClaimId);

    const publicClaimsAfterPending = await app.request("/api/people/demo-agent-builder/claims");
    const publicClaimsAfterPendingJson = await publicClaimsAfterPending.json();
    expect(publicClaimsAfterPendingJson.claims.map((claim: { id?: string }) => claim.id)).not.toContain(pendingClaimId);

    const workspaceAfterPending = await app.request("/api/people/demo-agent-builder/workspace");
    const workspaceAfterPendingJson = await workspaceAfterPending.json();
    expect(workspaceAfterPendingJson.profile.claims.map((claim: { id?: string }) => claim.id)).toEqual(expect.arrayContaining([claimId, pendingClaimId]));

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
    expect(searchJson.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        person: expect.objectContaining({
          handle: "demo-agent-builder"
        })
      })
    ]));
  });

  it("returns review status and workspace links when GitHub import degrades into source review", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl === "https://api.github.com/users/torvalds") {
          return new Response("rate limited", {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" }
          });
        }
        if (textUrl === "https://github.com/torvalds") {
          return new Response(`
            <html>
              <head>
                <title>torvalds - Overview</title>
                <meta name="description" content="torvalds has public GitHub activity available." />
              </head>
            </html>
          `);
        }
        return fixtureFetch(url);
      }
    });

    const importResponse = await app.request("/api/import/github", {
      method: "POST",
      body: JSON.stringify({ input: "torvalds" }),
      headers: { "content-type": "application/json" }
    });

    expect(importResponse.status).toBe(200);
    await expect(importResponse.json()).resolves.toMatchObject({
      handle: "torvalds",
      status: "needs_review",
      cardCount: expect.any(Number),
      artifactCount: expect.any(Number),
      warnings: ["github: GitHub anonymous API limit reached. OpenDinq can continue with public web evidence; add GITHUB_TOKEN to improve GitHub completeness."],
      recoveryAdvice: {
        kind: "github_token_setup",
        title: "Add a GitHub token for stronger imports",
        message: "GitHub's anonymous API limit reduced import completeness, so OpenDinq continued with public web evidence and created a reviewable result.",
        actionLabel: "Improve local GitHub imports with GITHUB_TOKEN",
        actionCommand: "GITHUB_TOKEN=YOUR_TOKEN pnpm dev"
      },
      workspaceUrl: "/u/torvalds/workspace",
      profileUrl: "/u/torvalds"
    });

    const profileResponse = await app.request("/api/people/torvalds");
    expect(profileResponse.status).toBe(200);
    await expect(profileResponse.json()).resolves.toMatchObject({
      artifacts: expect.arrayContaining([
        expect.objectContaining({
          type: "website",
          title: "torvalds - Overview",
          url: "https://github.com/torvalds"
        })
      ])
    });
  });

  it("replaces generic GitHub repository-count headlines with a language-based profile headline", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl === "https://api.github.com/users/torvalds") {
          return Response.json({
            id: 1024025,
            login: "torvalds",
            name: "Linus Torvalds",
            bio: null,
            location: "Portland, OR",
            avatar_url: "https://avatars.githubusercontent.com/u/1024025?v=4",
            html_url: "https://github.com/torvalds",
            public_repos: 11,
            followers: 1000,
            following: 0
          });
        }
        if (textUrl === "https://api.github.com/users/torvalds/repos?per_page=100&sort=updated&type=owner") {
          return Response.json([
            {
              id: 1,
              name: "linux",
              full_name: "torvalds/linux",
              html_url: "https://github.com/torvalds/linux",
              description: "Linux kernel source tree",
              fork: false,
              stargazers_count: 1,
              forks_count: 1,
              language: "C",
              topics: [],
              pushed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              created_at: "2011-09-04T22:48:12Z",
              archived: false,
              disabled: false
            },
            {
              id: 2,
              name: "subsurface-for-dirk",
              full_name: "torvalds/subsurface-for-dirk",
              html_url: "https://github.com/torvalds/subsurface-for-dirk",
              description: "Dive log fork",
              fork: true,
              stargazers_count: 1,
              forks_count: 1,
              language: "C++",
              topics: [],
              pushed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              created_at: "2017-01-11T18:03:01Z",
              archived: false,
              disabled: false
            }
          ]);
        }
        return fixtureFetch(url);
      }
    });

    const generateResponse = await app.request("/api/profiles/generate", {
      method: "POST",
      body: JSON.stringify({
        sources: [{ type: "github", input: "torvalds" }]
      }),
      headers: { "content-type": "application/json" }
    });

    expect(generateResponse.status).toBe(200);
    const generated = await generateResponse.json();

    const profileResponse = await app.request(`/api/people/${generated.handle}`);
    expect(profileResponse.status).toBe(200);
    await expect(profileResponse.json()).resolves.toMatchObject({
      person: {
        handle: "torvalds",
        displayName: "Linus Torvalds",
        headline: "Open-source C and C++ developer"
      }
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

    const missingClaimsResponse = await app.request("/api/people/missing/claims");
    expect(missingClaimsResponse.status).toBe(404);
    await expect(missingClaimsResponse.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Person was not found."
      }
    });

    const missingAppendImportResponse = await app.request("/api/import/website", {
      method: "POST",
      body: JSON.stringify({ handle: "missing", url: "https://example.com" }),
      headers: { "content-type": "application/json" }
    });
    expect(missingAppendImportResponse.status).toBe(404);
    await expect(missingAppendImportResponse.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "Person was not found."
      }
    });
  });

  it("seeds demo profiles and exposes them through local public search", async () => {
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
    expect(searchJson.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        person: expect.objectContaining({
          handle: "demo-systems-maintainer"
        })
      })
    ]));
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

  it("rewrites duplicate synthesized claim ids before storing a generated profile", async () => {
    const store = createMemoryStore();
    const generator = createProfileGenerator({
      store,
      synthesizeClaims: () => [
        {
          id: "claim-torvalds-1",
          type: "project",
          text: "Maintains public kernel work",
          confidence: 0.9,
          evidence: [{ id: "manual-1", type: "artifact", title: "Kernel note", reason: "Manual evidence" }]
        },
        {
          id: "claim-torvalds-1",
          type: "skill",
          text: "Works on systems software",
          confidence: 0.85,
          evidence: [{ id: "manual-2", type: "artifact", title: "Systems note", reason: "Manual evidence" }]
        }
      ]
    });

    await generator.generate({
      displayName: "Torvalds",
      handle: "torvalds",
      sources: [{ type: "manual", input: { title: "Profile note", note: "Public profile evidence." } }]
    });

    const profile = await store.getProfile("torvalds");
    const claimIds = (profile?.claims ?? []).map((claim) => claim.id).filter(Boolean);
    expect(claimIds).toHaveLength(2);
    expect(new Set(claimIds).size).toBe(claimIds.length);
    expect(claimIds).toContain("claim-torvalds-1");
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

    const profileResponse = await app.request("/api/people/partial-builder");
    const profileJson = await profileResponse.json();
    expect(profileJson.sources).toEqual([
      expect.objectContaining({ type: "website", url: "https://example.com/" })
    ]);
  });

  it("keeps generation reviewable when every connector fails", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/generate", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Rate Limited Builder",
        handle: "rate-limited-builder",
        sources: [{ type: "github", input: "-bad-user" }]
      }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      handle: "rate-limited-builder",
      status: "needs_review",
      artifactsImported: 1,
      claimsGenerated: 1
    });
    expect(json.warnings[0]).toContain("github");

    const profileResponse = await app.request("/api/people/rate-limited-builder");
    const profileJson = await profileResponse.json();
    expect(profileJson.cards).toEqual(expect.arrayContaining([expect.objectContaining({ type: "summary" })]));
    expect(profileJson.claims[0].text).toContain("needs source review");
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
    const manualJson = await manualResponse.json();
    expect(manualJson).toMatchObject({
      handle: "demo-agent-builder",
      sourceCount: expect.any(Number),
      artifactCount: expect.any(Number),
      cardCount: expect.any(Number)
    });

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
    const profileCounts = {
      sources: profileJson.sources.length,
      artifacts: profileJson.artifacts.length,
      cards: profileJson.cards.length,
      claims: profileJson.claims.length
    };
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
    expect(profileJson.artifacts.filter((artifact: { title: string }) => artifact.title === "Agent evaluation dashboard")).toHaveLength(1);

    const repeatWebsiteResponse = await app.request("/api/import/website", {
      method: "POST",
      body: JSON.stringify({ handle: "demo-agent-builder", url: "https://example.com" }),
      headers: { "content-type": "application/json" }
    });
    expect(repeatWebsiteResponse.status).toBe(200);

    const repeatedProfileResponse = await app.request("/api/people/demo-agent-builder");
    const repeatedProfileJson = await repeatedProfileResponse.json();
    expect({
      sources: repeatedProfileJson.sources.length,
      artifacts: repeatedProfileJson.artifacts.length,
      cards: repeatedProfileJson.cards.length,
      claims: repeatedProfileJson.claims.length
    }).toEqual(profileCounts);
    expect(repeatedProfileJson.artifacts.filter((artifact: { title: string }) => artifact.title === "Agent evaluation dashboard")).toHaveLength(1);

    const workspaceResponse = await app.request("/api/people/demo-agent-builder/workspace");
    const workspaceJson = await workspaceResponse.json();
    expect(workspaceJson.profile.artifacts.filter((artifact: { title: string }) => artifact.title === "Agent evaluation dashboard")).toHaveLength(1);
    expect(workspaceJson.profile.cards.length).toBeGreaterThanOrEqual(repeatedProfileJson.cards.length);
    expect(workspaceJson.profile.claims.length).toBeGreaterThanOrEqual(repeatedProfileJson.claims.length);
    const workspaceClaimIds = workspaceJson.profile.claims.map((claim: { id?: string }) => claim.id).filter(Boolean);
    expect(new Set(workspaceClaimIds).size).toBe(workspaceClaimIds.length);
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
          subject: { handle: "demo-agent-builder" },
          sources: [{ type: "github", input: "demo-agent-builder", reason: "GitHub URL provided.", confidence: 0.95, evidenceStatus: "explicit" }],
          userProvidedClaims: [],
          missingEvidence: [],
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

  it("lets the agent turn arbitrary natural language into tool calls and generated cards", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          reasoning: "The user wants research on a person. Use the GitHub handle the agent inferred from the request, then fetch the generated profile and cards.",
          toolCalls: [
            { tool: "opendinq_resolve_profile_candidates", input: { query: "demo-agent-builder" } },
            { tool: "opendinq_generate_profile_ai", input: { input: "demo-agent-builder" } },
            { tool: "opendinq_get_profile", input: {} },
            { tool: "opendinq_list_cards", input: {} },
            { tool: "opendinq_search_people", input: { query: "AI agent TypeScript MCP" } }
          ]
        })
        .mockResolvedValueOnce([
          { type: "project", text: "Builds TypeScript MCP tools for AI agent workflows", confidence: 0.92, evidenceRefs: [{ id: "https://github.com/demo-agent-builder/agent-tools" }] }
        ])
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "搜索一下 demo-agent-builder，然后给我卡片" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      agentUsed: true,
      llmUsed: true,
      handle: "demo-agent-builder",
      profileUrl: "/u/demo-agent-builder",
      workspaceUrl: "/u/demo-agent-builder/workspace",
      cardsGenerated: expect.any(Number),
      profile: {
        person: { handle: "demo-agent-builder" }
      },
      researchSteps: expect.arrayContaining([
        expect.objectContaining({ tool: "opendinq_resolve_profile_candidates", title: "Find public candidates" }),
        expect.objectContaining({ tool: "opendinq_generate_profile_ai", title: "Generate evidence-backed profile" })
      ])
    });
    expect(json.cardsGenerated).toBeGreaterThan(0);
    expect(json.profile.cards).toEqual(expect.arrayContaining([expect.objectContaining({ evidence: expect.any(Array) })]));
    expect(json.cards).toEqual(expect.arrayContaining([expect.objectContaining({ evidence: expect.any(Array) })]));
    expect(json.searchResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ person: expect.objectContaining({ handle: "demo-agent-builder" }) })
    ]));
    expect(json.toolCalls.map((call: { tool: string }) => call.tool)).toEqual([
      "opendinq_resolve_profile_candidates",
      "opendinq_generate_profile_ai",
      "opendinq_get_profile",
      "opendinq_list_cards",
      "opendinq_search_people"
    ]);
  });

  it("accepts common tool-call JSON shapes from OpenAI-compatible models", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          tool_calls: [
            { name: "opendinq_resolve_profile_candidates", arguments: { query: "demo-agent-builder" } },
            { name: "opendinq_generate_profile_ai", arguments: { input: "demo-agent-builder" } },
            { name: "opendinq_get_profile", arguments: "{}" },
            { name: "opendinq_list_cards", arguments: "{}" },
            { name: "opendinq_search_people", arguments: { query: "demo-agent-builder" } }
          ]
        })
        .mockResolvedValueOnce([
          { type: "project", text: "Builds TypeScript MCP tools for AI agent workflows", confidence: 0.92, evidenceRefs: [{ id: "https://github.com/demo-agent-builder/agent-tools" }] }
        ])
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research demo-agent-builder and return cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      agentUsed: true,
      handle: "demo-agent-builder",
      cardsGenerated: expect.any(Number)
    });
    expect(json.toolCalls.map((call: { tool: string }) => call.tool)).toEqual([
      "opendinq_resolve_profile_candidates",
      "opendinq_generate_profile_ai",
      "opendinq_get_profile",
      "opendinq_list_cards",
      "opendinq_search_people"
    ]);
  });

  it("returns warnings instead of bad request when an agent LLM call aborts", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockRejectedValueOnce(new Error("This operation was aborted"))
        .mockResolvedValueOnce([
          { type: "project", text: "Builds TypeScript MCP tools for AI agent workflows", confidence: 0.92, evidenceRefs: [{ id: "https://github.com/demo-agent-builder/agent-tools" }] }
        ])
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research demo-agent-builder and return cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      agentUsed: true,
      handle: "demo-agent-builder",
      warnings: expect.arrayContaining([expect.stringContaining("Agent tool planning failed")])
    });
  });

  it("marks manual-only agent output as needing public source and limits search results to the generated profile", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_generate_profile_ai", input: { input: "Research Unknown Personzz and return profile cards." } },
            { tool: "opendinq_get_profile", input: {} },
            { tool: "opendinq_list_cards", input: {} },
            { tool: "opendinq_search_people", input: { query: "Research Unknown Personzz and return profile cards." } }
          ]
        })
        .mockResolvedValueOnce({
          rawInput: "Research Unknown Personzz and return profile cards.",
          intent: "manual_profile",
          confidence: 0.7,
          subject: { displayName: "Unknown Personzz" },
          sources: [],
          userProvidedClaims: [{ type: "summary", text: "Research Unknown Personzz and return profile cards", confidence: 0.45, evidenceStatus: "user_provided" }],
          missingEvidence: [{ need: "Public source", reason: "No verified source was provided." }],
          warnings: ["No specific URLs, handles, or IDs were provided."],
          questions: []
        })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient, seedDemo: true });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research Unknown Personzz and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_public_source",
      agentUsed: true,
      handle: "unknown-personzz",
      warnings: expect.arrayContaining([expect.stringContaining("No verified public source was found")])
    });
    expect(json.searchResults.map((result: { person: { handle: string } }) => result.person.handle)).toEqual(["unknown-personzz"]);
    expect(json.searchResults.map((result: { person: { handle: string } }) => result.person.handle)).not.toContain("demo-agent-builder");
  });

  it("resolves a public candidate before accepting manual-only agent output", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_generate_profile_ai", input: { input: "Research elonmusk and return profile cards." } }
          ]
        })
        .mockResolvedValueOnce({
          rawInput: "Research elonmusk and return profile cards.",
          intent: "manual_profile",
          confidence: 0.7,
          subject: { displayName: "elonmusk", handle: "elonmusk" },
          sources: [],
          userProvidedClaims: [{ type: "summary", text: "Research elonmusk and return profile cards", confidence: 0.45, evidenceStatus: "user_provided" }],
          missingEvidence: [{ need: "Public source", reason: "No verified source was provided." }],
          warnings: ["No specific URLs, handles, or IDs were provided."],
          questions: []
        })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research elonmusk and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "completed",
      agentUsed: true,
      handle: "elonmusk",
      artifactsImported: expect.any(Number),
      warnings: expect.arrayContaining([expect.stringContaining("resolved \"elonmusk\" to a public github source")])
    });
    expect(json.artifactsImported).toBeGreaterThan(0);
  });

  it("requires selection instead of generating manual-only profiles when public candidates are available", async () => {
    vi.stubEnv("OPEN_DINQ_ENABLE_LLM_GENERATION", "false");
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_generate_profile_ai", input: { input: "Research Andrej Karpaty open source llm education and return profile cards." } }
          ]
        })
        .mockResolvedValueOnce({
          rawInput: "Research Andrej Karpaty open source llm education and return profile cards.",
          intent: "manual_profile",
          confidence: 0.45,
          subject: { displayName: "Andrej Karpaty", handle: "andrej-karpaty-open-source-llm-education" },
          sources: [],
          userProvidedClaims: [{ type: "summary", text: "Research Andrej Karpaty open source llm education and return profile cards.", confidence: 0.45, evidenceStatus: "user_provided" }],
          missingEvidence: [{ need: "Public source", reason: "The request names a person but no source was selected." }],
          warnings: ["No verified source was selected."],
          questions: []
        })
    };
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          const decodedUrl = decodeURIComponent(textUrl).toLowerCase().replace(/\+/g, " ");
          if (decodedUrl.includes("andrej")) {
            return Response.json({
              results: [{
                id: "https://openalex.org/A1969205032",
                display_name: "Andrej Karpathy",
                last_known_institutions: [{ display_name: "OpenAI" }],
                works_count: 25,
                cited_by_count: 58_894,
                summary_stats: { h_index: 20 }
              }]
            });
          }
          return Response.json({ results: [] });
        }
        if (
          textUrl.startsWith("https://api.github.com/search/users?")
          || textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")
        ) {
          return Response.json(textUrl.startsWith("https://pub.orcid.org") ? { "expanded-result": [] } : { items: [] });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research Andrej Karpaty open source llm education and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_selection",
      agentUsed: false,
      candidates: expect.arrayContaining([
        expect.objectContaining({ displayName: "Andrej Karpathy", sourceType: "openalex" })
      ])
    });
    expect(json.handle).toBeUndefined();
    expect(json.profileUrl).toBeUndefined();
    expect(llmClient.completeJson).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("uses candidate resolution as an agent tool before generation for free-form public-source research", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_resolve_profile_candidates", input: { query: "Research elonmusk and return profile cards." } },
            { tool: "opendinq_generate_profile_ai", input: { input: "Research elonmusk and return profile cards." } },
            { tool: "opendinq_get_profile", input: {} },
            { tool: "opendinq_list_cards", input: {} },
            { tool: "opendinq_search_people", input: { query: "elonmusk" } }
          ]
        })
        .mockResolvedValueOnce([
          { type: "project", text: "Maintains public GitHub repositories used as evidence.", confidence: 0.82, evidenceRefs: [{ id: "https://github.com/elonmusk/agent-tools" }] }
        ])
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research elonmusk and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "completed",
      agentUsed: true,
      llmUsed: true,
      handle: "elonmusk",
      artifactsImported: expect.any(Number),
      cardsGenerated: expect.any(Number),
      toolResults: expect.arrayContaining([
        expect.objectContaining({
          tool: "opendinq_resolve_profile_candidates",
          result: expect.objectContaining({
            candidateCount: expect.any(Number),
            selectedCandidate: expect.objectContaining({ handle: "elonmusk", sourceType: "github" })
          })
        })
      ]),
      researchSteps: expect.arrayContaining([
        expect.objectContaining({
          tool: "opendinq_resolve_profile_candidates",
          summary: expect.stringContaining("Selected elonmusk from github")
        }),
        expect.objectContaining({
          tool: "opendinq_generate_profile_ai",
          summary: expect.stringContaining("Created elonmusk")
        })
      ])
    });
    expect(json.toolCalls.map((call: { tool: string }) => call.tool)).toEqual([
      "opendinq_resolve_profile_candidates",
      "opendinq_generate_profile_ai",
      "opendinq_get_profile",
      "opendinq_list_cards",
      "opendinq_search_people"
    ]);
    expect(json.toolResults[0].result.candidateCount).toBeGreaterThan(0);
    expect(json.profile.artifacts.map((artifact: { url?: string }) => artifact.url)).toEqual(
      expect.arrayContaining([expect.stringContaining("https://github.com/elonmusk/")])
    );
  });

  it("prefers an inferred GitHub handle from natural language over unrelated connector noise", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_resolve_profile_candidates", input: { query: "Research elonmusk and return profile cards." } },
            { tool: "opendinq_generate_profile_ai", input: { input: "Research elonmusk and return profile cards." } },
            { tool: "opendinq_get_profile", input: {} },
            { tool: "opendinq_list_cards", input: {} }
          ]
        })
        .mockResolvedValueOnce([
          { type: "project", text: "Maintains public GitHub repositories used as evidence.", confidence: 0.82, evidenceRefs: [{ id: "https://github.com/elonmusk/agent-tools" }] }
        ])
    };
    const fetchImpl = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://api.github.com/search/users?")) {
        return Response.json({ items: [] });
      }
      if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
        return Response.json({
          "expanded-result": [
            {
              "orcid-id": "0009-0005-2726-2240",
              "given-names": "Arslan",
              "family-names": "Korkchi",
              "credit-name": "Ace Korkchi",
              institution: ["University of Gothenburg"]
            }
          ]
        });
      }
      return fixtureFetch(url);
    };
    const app = createApp({ fetchImpl, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research elonmusk and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "completed",
      handle: "elonmusk",
      toolResults: expect.arrayContaining([
        expect.objectContaining({
          tool: "opendinq_resolve_profile_candidates",
          result: expect.objectContaining({
            selectedCandidate: expect.objectContaining({ handle: "elonmusk", sourceType: "github" })
          })
        })
      ])
    });
    expect(json.handle).not.toBe("generated-profile");
    expect(json.profile.artifacts.map((artifact: { url?: string }) => artifact.url)).toEqual(
      expect.arrayContaining([expect.stringContaining("https://github.com/elonmusk/")])
    );
  });

  it("generates a selected GitHub candidate when the agent plan stops after candidate resolution", async () => {
    const llmClient = {
      completeJson: vi.fn().mockResolvedValueOnce({
        toolCalls: [
          { tool: "opendinq_resolve_profile_candidates", input: { query: "elonmusk" } }
        ]
      })
    };
    const fetchImpl = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://api.github.com/search/users?")) {
        return Response.json({
          items: [
            { login: "elon", id: 41, html_url: "https://github.com/elon", type: "User", score: 100 },
            { login: "elonmusk", id: 42, html_url: "https://github.com/elonmusk", type: "User", score: 100 }
          ]
        });
      }
      return fixtureFetch(url);
    };
    const app = createApp({ fetchImpl, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research elonmusk and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "completed",
      agentUsed: true,
      handle: "elonmusk",
      profileUrl: "/u/elonmusk",
      warnings: expect.arrayContaining([expect.stringContaining("stopped before generation")])
    });
    expect(json.toolResults[0].result.selectedCandidate).toMatchObject({ handle: "elonmusk" });
    expect(json.handle).not.toBe("elon");
  });

  it("does not infer a one-token GitHub handle for multi-term academic agent searches", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_resolve_profile_candidates", input: { query: "jiajun wu stanford 3d scene understanding" } }
          ]
        })
        .mockResolvedValueOnce([
          { type: "research_area", text: "Works on 3D scene understanding.", confidence: 0.86, evidenceRefs: [{ id: "https://openalex.org/W1" }] }
        ])
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "jiajun wu stanford 3d scene understanding" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "completed",
      agentUsed: true,
      handle: "jiajun-wu",
      toolResults: expect.arrayContaining([
        expect.objectContaining({
          tool: "opendinq_resolve_profile_candidates",
          result: expect.objectContaining({
            selectedCandidate: expect.objectContaining({
              displayName: "Jiajun Wu",
              sourceType: "openalex"
            })
          })
        })
      ])
    });
    expect(json.toolResults[0].result.selectedCandidate).not.toMatchObject({ sourceType: "github", handle: "jiajun" });
    expect(json.profile.sources).toEqual(expect.arrayContaining([expect.objectContaining({ type: "openalex" })]));
  });

  it("stops for user confirmation when agent candidate search is ambiguous", async () => {
    const llmClient = {
      completeJson: vi.fn().mockResolvedValueOnce({
        toolCalls: [
          { tool: "opendinq_resolve_profile_candidates", input: { query: "jiajun wu stanford 3d scene understanding" } },
          { tool: "opendinq_generate_profile_ai", input: { input: "jiajun wu stanford 3d scene understanding" } }
        ]
      })
    };
    const fetchImpl = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://api.openalex.org/authors?") || textUrl.startsWith("https://api.github.com/search/users?")) {
        return Response.json(textUrl.includes("github") ? { items: [] } : { results: [] });
      }
      if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
        return new Response("<feed></feed>");
      }
      if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
        return Response.json({
          "expanded-result": [
            { "orcid-id": "0000-0002-4176-343X", "given-names": "Jiajun", "family-names": "Wu", "credit-name": "Jiajun Wu" },
            { "orcid-id": "0009-0008-5798-3358", "given-names": "Jiajun", "family-names": "Wu", "credit-name": "Jiajun Wu" }
          ]
        });
      }
      return fixtureFetch(url);
    };
    const app = createApp({ fetchImpl, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "jiajun wu stanford 3d scene understanding" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_selection",
      agentUsed: true,
      llmUsed: true,
      candidates: expect.any(Array),
      warnings: expect.arrayContaining([expect.stringContaining("none was strong enough")])
    });
    expect(json.candidates).toHaveLength(2);
    expect(json.toolCalls.map((call: { tool: string }) => call.tool)).toEqual([
      "opendinq_resolve_profile_candidates",
      "opendinq_generate_profile_ai"
    ]);
    expect(llmClient.completeJson).toHaveBeenCalledTimes(1);
  });

  it("uses the generated handle when an agent tool call contains a template placeholder", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_generate_profile_ai", input: { input: "Research Unknown Personzz and return profile cards." } },
            { tool: "opendinq_get_profile", input: { handle: "{{generated_handle}}" } },
            { tool: "opendinq_list_cards", input: { handle: "{{generated_handle}}" } }
          ]
        })
        .mockResolvedValueOnce({
          rawInput: "Research Unknown Personzz and return profile cards.",
          intent: "manual_profile",
          confidence: 0.6,
          subject: { displayName: "Unknown Personzz and Return Profile Cards", handle: "unknown-personzz-and-return-profile-cards" },
          sources: [],
          userProvidedClaims: [{ type: "summary", text: "Research Unknown Personzz and return profile cards.", confidence: 0.45, evidenceStatus: "user_provided" }],
          missingEvidence: [{ need: "Public source", reason: "No verified source was provided." }],
          warnings: ["No public source was provided."],
          questions: []
        })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research Unknown Personzz and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_public_source",
      handle: "unknown-personzz",
      profile: {
        person: {
          handle: "unknown-personzz",
          displayName: "Unknown Personzz"
        }
      }
    });
    expect(json.warnings.join(" ")).not.toContain("{{generated_handle}}");
    expect(json.warnings.join(" ")).not.toContain("Profile {{generated_handle}} was not found");
  });

  it("does not resolve manual-only agent output to an existing manual draft as public evidence", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          rawInput: "Research and generate a profile for Zorblatt Q. Unmade using public web results only.",
          intent: "manual_profile",
          confidence: 0.4,
          subject: { displayName: "And Generate A", handle: "and-generate-a" },
          sources: [],
          userProvidedClaims: [{ type: "summary", text: "Research and generate a profile for Zorblatt Q. Unmade using public web results only.", confidence: 0.45, evidenceStatus: "user_provided" }],
          missingEvidence: [{ need: "Public source", reason: "No verified source was provided." }],
          warnings: ["No public source was provided."],
          questions: []
        })
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_generate_profile_ai", input: { input: "Research and generate a profile for Zorblatt Q. Unmade using public web results only." } }
          ]
        })
        .mockResolvedValueOnce({
          rawInput: "Research and generate a profile for Zorblatt Q. Unmade using public web results only.",
          intent: "manual_profile",
          confidence: 0.4,
          subject: { displayName: "And Generate A", handle: "and-generate-a" },
          sources: [],
          userProvidedClaims: [{ type: "summary", text: "Research and generate a profile for Zorblatt Q. Unmade using public web results only.", confidence: 0.45, evidenceStatus: "user_provided" }],
          missingEvidence: [{ need: "Public source", reason: "No verified source was provided." }],
          warnings: ["No public source was provided."],
          questions: []
        })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });
    await app.request("/api/profiles/generate-ai", {
      method: "POST",
      body: JSON.stringify({ input: "Research and generate a profile for Zorblatt Q. Unmade using public web results only." }),
      headers: { "content-type": "application/json" }
    });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research Zorblatt Q. Unmade and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_public_source",
      handle: "zorblatt-q-unmade"
    });
    expect(json.warnings.join(" ")).not.toContain("existing_profile");
    expect(json.handle).not.toBe("and-generate-a");
  });

  it("returns reviewable generation instead of 400 when a selected public candidate has no works", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.endsWith("/0000-0002-7481-0810/record")) {
          return Response.json({
            "orcid-identifier": {
              path: "0000-0002-7481-0810",
              uri: "https://orcid.org/0000-0002-7481-0810"
            },
            person: {
              name: {
                "given-names": { value: "Li" },
                "family-name": { value: "Fei-Fei" }
              }
            },
            "activities-summary": {
              works: { group: [] }
            }
          });
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/generate-from-candidate", {
      method: "POST",
      body: JSON.stringify({
        rawInput: "Fei-Fei Li Stanford computer vision",
        candidateId: "orcid-feifei",
        candidate: {
          id: "orcid-feifei",
          displayName: "Li Fei-Fei",
          sourceType: "orcid",
          sourceId: "0000-0002-7481-0810",
          sourceUrl: "https://orcid.org/0000-0002-7481-0810",
          confidence: 0.64,
          evidencePreview: [{ id: "0000-0002-7481-0810", type: "external", title: "ORCID record Li Fei-Fei", url: "https://orcid.org/0000-0002-7481-0810", reason: "ORCID public search returned this candidate." }],
          reasons: ["ORCID public search candidate."],
          warnings: []
        }
      }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_review",
      handle: "li-fei-fei",
      artifactsImported: 1,
      claimsGenerated: 1,
      warnings: expect.arrayContaining([expect.stringContaining("No usable public artifacts")])
    });
  });

  it("uses public web evidence when GitHub API import is rate limited", async () => {
    const llmClient = {
      completeJson: vi.fn()
        .mockResolvedValueOnce({
          toolCalls: [
            { tool: "opendinq_resolve_profile_candidates", input: { query: "Research elonmusk and return profile cards." } },
            { tool: "opendinq_generate_profile_ai", input: { input: "Research elonmusk and return profile cards." } },
            { tool: "opendinq_get_profile", input: {} },
            { tool: "opendinq_list_cards", input: {} }
          ]
        })
        .mockResolvedValueOnce([
          { type: "link", text: "Public GitHub profile page is available as web evidence.", confidence: 0.8, evidenceRefs: ["https://github.com/elonmusk"] }
        ])
    };
    const fetchImpl = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://api.github.com/")) {
        return new Response("rate limited", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
      }
      if (textUrl === "https://github.com/elonmusk") {
        return new Response(`
          <html>
            <head>
              <meta property="og:title" content="elonmusk - GitHub" />
              <meta name="description" content="Public GitHub profile page for elonmusk." />
            </head>
          </html>
        `);
      }
      return fixtureFetch(url);
    };
    const app = createApp({ fetchImpl, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research elonmusk and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      handle: "elonmusk",
      cardsGenerated: expect.any(Number),
      artifactsImported: expect.any(Number)
    });
    expect(json.cardsGenerated).toBeGreaterThan(0);
    expect(json.artifactsImported).toBeGreaterThan(0);
    expect(json.profile.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "website",
        title: "elonmusk - GitHub",
        url: "https://github.com/elonmusk"
      })
    ]));
    expect(json.warnings.join(" ")).toContain("GitHub anonymous API limit reached");
    expect(json.recoveryAdvice).toMatchObject({
      kind: "github_token_setup",
      title: "Add a GitHub token for stronger imports",
      message: "GitHub's anonymous API limit reduced import completeness, so OpenDinq continued with public web evidence and created a reviewable result.",
      actionCommand: "GITHUB_TOKEN=YOUR_TOKEN pnpm dev"
    });
  });

  it("keeps generate-from-candidate reviewable for GitHub candidates during anonymous rate limits", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.github.com/")) {
          return new Response("rate limited", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
        }
        if (textUrl === "https://github.com/elonmusk") {
          return new Response(`
            <html>
              <head>
                <meta property="og:title" content="elonmusk - GitHub" />
                <meta name="description" content="Public GitHub profile page for elonmusk." />
              </head>
            </html>
          `);
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/generate-from-candidate", {
      method: "POST",
      body: JSON.stringify({
        rawInput: "https://github.com/elonmusk",
        candidateId: "github:elonmusk",
        candidate: {
          id: "github:elonmusk",
          displayName: "elonmusk",
          handle: "elonmusk",
          sourceType: "github",
          sourceId: "elonmusk",
          sourceUrl: "https://github.com/elonmusk",
          confidence: 0.96,
          evidencePreview: [{ id: "https://github.com/elonmusk", type: "external", title: "GitHub profile elonmusk", url: "https://github.com/elonmusk", reason: "Direct GitHub source provided." }],
          reasons: ["Direct GitHub source provided."],
          warnings: []
        }
      }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      handle: "elonmusk",
      status: "needs_review",
      artifactsImported: expect.any(Number),
      recoveryAdvice: expect.objectContaining({
        kind: "github_token_setup",
        title: "Add a GitHub token for stronger imports"
      }),
      warnings: expect.arrayContaining([expect.stringContaining("GitHub anonymous API limit reached")])
    });
  });

  it("does not return unrelated deterministic candidates for free-form agent search without LLM configuration", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research unknownpersonzz and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      rawInput: "Research unknownpersonzz and return profile cards.",
      status: "needs_public_source",
      agentUsed: false,
      llmUsed: false,
      candidates: [],
      toolCalls: []
    });
  });

  it("filters connector noise for unknown multi-term person searches", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.github.com/search/users?")) {
          return Response.json({
            items: [
              { login: "unrelated-builder", id: 77, html_url: "https://github.com/unrelated-builder", type: "User", score: 100 }
            ]
          });
        }
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          return Response.json({
            results: [
              { id: "https://openalex.org/A777", display_name: "Different Person", works_count: 20, cited_by_count: 300 }
            ]
          });
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Research Zorblatt Q. Unmade and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      candidates: [],
      needsSelection: false,
      warnings: expect.arrayContaining([expect.stringContaining("No public candidate found yet")])
    });
  });

  it("keeps both GitHub and OpenAlex candidates for ambiguous plain-name searches", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          return Response.json({
            results: [
              {
                id: "https://openalex.org/A5083555959",
                display_name: "Linus Torvalds",
                works_count: 9,
                cited_by_count: 429,
                last_known_institutions: [{ display_name: "Linux Foundation" }],
                summary_stats: { h_index: 2 }
              }
            ]
          });
        }
        if (textUrl.startsWith("https://api.github.com/search/users?")) {
          return Response.json({
            items: [
              {
                login: "torvalds",
                id: 1024025,
                html_url: "https://github.com/torvalds",
                type: "User",
                score: 1
              }
            ]
          });
        }
        if (textUrl === "https://api.github.com/users/torvalds") {
          return Response.json({
            login: "torvalds",
            id: 1024025,
            html_url: "https://github.com/torvalds",
            name: "Linus Torvalds",
            bio: "Linux kernel creator"
          });
        }
        if (textUrl === "https://api.github.com/users/torvalds/repos?per_page=100&sort=updated&type=owner") {
          return Response.json([]);
        }
        if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
          return Response.json({ "expanded-result": [] });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Linus Torvalds" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.needsSelection).toBe(true);
    expect(json.autoSelectedCandidateId).toBeUndefined();
    expect(json.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "openalex", displayName: "Linus Torvalds" }),
      expect.objectContaining({ sourceType: "github", handle: "torvalds", sourceUrl: "https://github.com/torvalds" })
    ]));
  });

  it("does not recommend academic records for ordinary person-name searches", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          return Response.json({
            results: [
              {
                id: "https://openalex.org/A5026992422",
                display_name: "Elon Musk",
                works_count: 1200,
                cited_by_count: 85000,
                summary_stats: { h_index: 90 }
              }
            ]
          });
        }
        if (textUrl.startsWith("https://api.github.com/search/users?")) {
          return Response.json({
            items: [
              { login: "elonmusk", id: 42, html_url: "https://github.com/elonmusk", type: "User", score: 100 },
              { login: "elonmuskceo", id: 43, html_url: "https://github.com/elonmuskceo", type: "User", score: 99 }
            ]
          });
        }
        if (textUrl.startsWith("https://en.wikipedia.org/api/rest_v1/page/summary/")) {
          return Response.json({
            title: "Elon Musk",
            description: "Businessperson and engineer",
            extract: "Elon Musk is a public figure.",
            type: "standard",
            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Elon_Musk" } }
          });
        }
        if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
          return Response.json({
            "expanded-result": [
              {
                "orcid-id": "0009-0008-0526-2591",
                "given-names": "Elon",
                "family-names": "Musk",
                "credit-name": "Elon Musk"
              }
            ]
          });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Elon Musk" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.needsSelection).toBe(true);
    expect(json.autoSelectedCandidateId).toBeUndefined();
    expect(json.candidates[0]).toMatchObject({ sourceType: "github", handle: "elonmusk" });
    expect(json.candidates.map((candidate: { sourceUrl?: string }) => candidate.sourceUrl)).not.toContain("https://github.com/elonmuskceo");
    expect(json.candidates).toEqual(expect.arrayContaining([expect.objectContaining({
      sourceType: "website",
      sourceUrl: "https://en.wikipedia.org/wiki/Elon_Musk",
      confidence: 0.88
    })]));
    const websiteIndex = json.candidates.findIndex((candidate: { sourceType: string }) => candidate.sourceType === "website");
    const firstAcademicIndex = json.candidates.findIndex((candidate: { sourceType: string }) => ["openalex", "orcid", "arxiv"].includes(candidate.sourceType));
    expect(websiteIndex).toBeGreaterThanOrEqual(0);
    expect(firstAcademicIndex).toBeGreaterThan(websiteIndex);
    expect(json.candidates.filter((candidate: { sourceType: string }) => ["openalex", "orcid", "arxiv"].includes(candidate.sourceType))).toHaveLength(1);
    const openAlexCandidate = json.candidates.find((candidate: { sourceType: string }) => candidate.sourceType === "openalex");
    expect(openAlexCandidate.confidence).toBeLessThan(0.86);
    expect(openAlexCandidate).toMatchObject({
      warnings: expect.arrayContaining([expect.stringContaining("Academic record match needs confirmation")])
    });
  });

  it("requires review before generating from public-web biography matches", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          return Response.json({ results: [] });
        }
        if (textUrl.startsWith("https://api.github.com/search/users?")) {
          return Response.json({ items: [] });
        }
        if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
          return Response.json({ "expanded-result": [] });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        if (textUrl.startsWith("https://en.wikipedia.org/api/rest_v1/page/summary/")) {
          return Response.json({
            title: "Taylor Swift",
            description: "American singer-songwriter",
            extract: "Taylor Swift is a public figure.",
            type: "standard",
            content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Taylor_Swift" } }
          });
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Taylor Swift" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      needsSelection: true,
      candidates: [expect.objectContaining({
        sourceType: "website",
        sourceUrl: "https://en.wikipedia.org/wiki/Taylor_Swift",
        warnings: expect.arrayContaining([expect.stringContaining("review before generation")])
      })]
    });
    expect(json.autoSelectedCandidateId).toBeUndefined();

    const agentResponse = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Taylor Swift" }),
      headers: { "content-type": "application/json" }
    });

    expect(agentResponse.status).toBe(200);
    await expect(agentResponse.json()).resolves.toMatchObject({
      status: "needs_selection",
      needsSelection: true,
      candidates: [expect.objectContaining({
        sourceType: "website",
        sourceUrl: "https://en.wikipedia.org/wiki/Taylor_Swift"
      })],
      agentUsed: false,
      llmUsed: false
    });
  });

  it("keeps a merged existing-profile candidate source-neutral when public sources are present", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          return Response.json({
            results: [
              {
                id: "https://openalex.org/A5083555959",
                display_name: "Linus Torvalds",
                works_count: 9,
                cited_by_count: 429,
                last_known_institutions: [{ display_name: "Linux Foundation" }],
                summary_stats: { h_index: 2 }
              }
            ]
          });
        }
        if (textUrl.startsWith("https://api.github.com/search/users?")) {
          return Response.json({
            items: [
              {
                login: "torvalds",
                id: 1024025,
                html_url: "https://github.com/torvalds",
                type: "User",
                score: 1
              }
            ]
          });
        }
        if (textUrl === "https://api.github.com/users/torvalds") {
          return Response.json({
            login: "torvalds",
            id: 1024025,
            html_url: "https://github.com/torvalds",
            name: "Linus Torvalds",
            bio: "Linux kernel creator"
          });
        }
        if (textUrl === "https://api.github.com/users/torvalds/repos?per_page=100&sort=updated&type=owner") {
          return Response.json([]);
        }
        if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
          return Response.json({ "expanded-result": [] });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        return fixtureFetch(url);
      }
    });

    const importResponse = await app.request("/api/import/github", {
      method: "POST",
      body: JSON.stringify({ input: "torvalds" }),
      headers: { "content-type": "application/json" }
    });
    expect(importResponse.status).toBe(200);

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Linus Torvalds" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    const merged = json.candidates.find((candidate: {
      sources?: Array<{ sourceType: string; sourceUrl?: string }>;
      displayName: string;
    }) =>
      candidate.displayName === "Linus Torvalds"
      && candidate.sources?.some((source) => source.sourceType === "existing_profile" && source.sourceUrl === "/u/torvalds")
      && candidate.sources?.some((source) => source.sourceType === "openalex")
    );

    expect(merged).toMatchObject({
      sourceType: "openalex",
      displayName: "Linus Torvalds",
      sources: expect.arrayContaining([
        expect.objectContaining({ sourceType: "existing_profile", sourceUrl: "/u/torvalds" }),
        expect.objectContaining({ sourceType: "openalex" })
      ])
    });
    expect(merged.reasons[0]).toBe("Matched 2 public source records and linked them to an existing OpenDinq profile for the same person.");
    expect(merged.sources[0]?.sourceType).toBe("openalex");
    expect(json.needsSelection).toBe(true);
    expect(json.autoSelectedCandidateId).toBeUndefined();
    expect(json.candidates.filter((candidate: { sourceType: string; handle?: string }) =>
      candidate.sourceType === "github" && candidate.handle === "torvalds"
    )).toHaveLength(0);
    expect(json.candidates.filter((candidate: { sourceType: string; sourceUrl?: string }) =>
      candidate.sourceType === "existing_profile" && candidate.sourceUrl === "/u/torvalds"
    )).toHaveLength(0);
  });

  it("does not carry forward review fallback state when regenerating from an explicit public candidate", async () => {
    let githubRateLimited = true;
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (
          githubRateLimited
          && (
            textUrl === "https://api.github.com/users/torvalds"
            || textUrl === "https://api.github.com/users/torvalds/repos?per_page=100&sort=updated&type=owner"
          )
        ) {
          return new Response("rate limited", {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" }
          });
        }
        if (textUrl === "https://api.github.com/users/torvalds") {
          return Response.json({
            ...githubUser,
            login: "torvalds",
            id: 1024025,
            html_url: "https://github.com/torvalds",
            avatar_url: "https://avatars.githubusercontent.com/u/1024025?v=4",
            name: "Linus Torvalds",
            location: "Portland, OR",
            public_repos: 11
          });
        }
        if (textUrl === "https://api.github.com/users/torvalds/repos?per_page=100&sort=updated&type=owner") {
          return Response.json(
            githubRepos.map((repo, index) => ({
              ...repo,
              id: 9000 + index,
              full_name: `torvalds/${repo.name}`,
              html_url: `https://github.com/torvalds/${repo.name}`
            }))
          );
        }
        if (textUrl === "https://github.com/torvalds") {
          return new Response(`
            <html>
              <head>
                <title>torvalds - Overview</title>
                <meta name="description" content="torvalds has 11 repositories available. Follow their code on GitHub." />
                <meta property="og:image" content="https://avatars.githubusercontent.com/u/1024025?v=4?s=400" />
              </head>
            </html>
          `);
        }
        return fixtureFetch(url);
      }
    });

    const initialImport = await app.request("/api/import/github", {
      method: "POST",
      body: JSON.stringify({ input: "torvalds" }),
      headers: { "content-type": "application/json" }
    });
    expect(initialImport.status).toBe(200);
    githubRateLimited = false;

    const regenerateResponse = await app.request("/api/profiles/generate-from-candidate", {
      method: "POST",
      body: JSON.stringify({
        rawInput: "https://github.com/torvalds",
        candidateId: "person:57f9f6998f35",
        candidate: {
          id: "person:57f9f6998f35",
          displayName: "torvalds",
          handle: "torvalds",
          sourceType: "github",
          sourceId: "torvalds",
          sourceUrl: "https://github.com/torvalds",
          confidence: 0.96,
          evidencePreview: [
            {
              id: "https://github.com/torvalds",
              type: "external",
              title: "GitHub profile torvalds",
              url: "https://github.com/torvalds",
              reason: "User supplied this GitHub source."
            }
          ],
          reasons: ["Direct GitHub source provided."],
          warnings: [],
          sources: [
            {
              sourceType: "github",
              sourceId: "torvalds",
              sourceUrl: "https://github.com/torvalds",
              confidence: 0.96,
              evidencePreview: [
                {
                  id: "https://github.com/torvalds",
                  type: "external",
                  title: "GitHub profile torvalds",
                  url: "https://github.com/torvalds",
                  reason: "User supplied this GitHub source."
                }
              ],
              reasons: ["Direct GitHub source provided."],
              warnings: []
            },
            {
              sourceType: "existing_profile",
              sourceId: "torvalds",
              sourceUrl: "/u/torvalds",
              confidence: 0.92,
              evidencePreview: [],
              reasons: ["Matched an existing OpenDinq profile."],
              warnings: []
            }
          ]
        }
      }),
      headers: { "content-type": "application/json" }
    });
    expect(regenerateResponse.status).toBe(200);

    const profileResponse = await app.request("/api/people/torvalds");
    expect(profileResponse.status).toBe(200);
    const profileJson = await profileResponse.json();
    expect(profileJson.person.handle).toBe("torvalds");
    expect(profileJson.artifacts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Source import needs review" }),
      expect.objectContaining({ title: "torvalds profile request" })
    ]));
    expect(profileJson.claims.map((claim: { text: string }) => claim.text)).not.toContain("Profile generation needs source review before claims can be trusted");
  });

  it("filters low-relevance connector noise for role searches", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
          return Response.json({
            "expanded-result": [
              {
                "orcid-id": "0000-0002-1111-2222",
                "given-names": "Darren",
                "family-names": "Lester",
                "credit-name": "Darren Lester",
                institution: ["Unrelated Institute"]
              }
            ]
          });
        }
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          return Response.json({ results: [] });
        }
        if (textUrl.startsWith("https://api.github.com/search/users?")) {
          return Response.json({ items: [] });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "AI agent builders working on MCP" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      queryType: "role_search",
      candidates: []
    });
  });

  it("does not create a manual generated profile for role searches with no candidates", async () => {
    const llmClient = {
      completeJson: vi.fn().mockResolvedValueOnce({
        toolCalls: [
          { tool: "opendinq_resolve_profile_candidates", input: { query: "AI agent builders working on MCP" } },
          { tool: "opendinq_generate_profile_ai", input: { input: "AI agent builders working on MCP" } }
        ]
      })
    };
    const app = createApp({
      llmClient,
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          return Response.json({ results: [] });
        }
        if (textUrl.startsWith("https://api.github.com/search/users?")) {
          return Response.json({ items: [] });
        }
        if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
          return Response.json({ "expanded-result": [] });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "AI agent builders working on MCP" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_public_source",
      candidates: [],
      warnings: expect.arrayContaining([expect.stringContaining("No public candidate matched this role search")])
    });
    expect(json.handle).toBeUndefined();
    expect(llmClient.completeJson).toHaveBeenCalledTimes(1);
  });

  it("requires selection for ambiguous natural-language celebrity searches", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "我要搜索 elon musk，看下他的 profile cards" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_selection",
      agentUsed: false,
      llmUsed: false,
      candidates: expect.arrayContaining([
        expect.objectContaining({ displayName: "elonmusk", sourceType: "github", handle: "elonmusk" })
      ])
    });
    expect(json.handle).toBeUndefined();
  });

  it("uses deterministic public-source search for a clear GitHub handle when LLM is not configured", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research elonmusk and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "completed",
      agentUsed: false,
      llmUsed: false,
      handle: "elonmusk",
      profileUrl: "/u/elonmusk",
      workspaceUrl: "/u/elonmusk/workspace",
      cardsGenerated: expect.any(Number),
      artifactsImported: expect.any(Number)
    });
    expect(json.cardsGenerated).toBeGreaterThan(0);
    expect(json.artifactsImported).toBeGreaterThan(0);
  });

  it("returns ambiguous public candidates before calling a configured LLM", async () => {
    const llmClient = {
      completeJson: vi.fn().mockRejectedValue(new Error("LLM should not be called for ambiguous candidate preflight."))
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "ambiguous person" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      rawInput: "ambiguous person",
      status: "needs_selection",
      agentUsed: false,
      llmUsed: false,
      candidates: expect.any(Array),
      agentWarnings: [expect.stringContaining("multiple possible matches")]
    });
    expect(json.candidates.length).toBeGreaterThan(1);
    expect(llmClient.completeJson).not.toHaveBeenCalled();
  });

  it("researches public sources for person-name input before falling back to manual-only generation", async () => {
    const llmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "jiajun wu",
        intent: "manual_profile",
        confidence: 0.4,
        subject: { displayName: "Jiajun Wu", handle: "jiajun-wu" },
        sources: [],
        userProvidedClaims: [{ type: "summary", text: "jiajun wu", confidence: 0.4, evidenceStatus: "user_provided" }],
        missingEvidence: [{ need: "Public source", reason: "A name alone is ambiguous." }],
        warnings: ["A name alone is ambiguous."],
        questions: []
      })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const planResponse = await app.request("/api/profiles/plan", {
      method: "POST",
      body: JSON.stringify({ input: "jiajun wu" }),
      headers: { "content-type": "application/json" }
    });
    expect(planResponse.status).toBe(200);
    const planJson = await planResponse.json();
    expect(planJson.plan.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "openalex", input: "https://openalex.org/A5018878364" })])
    );

    const generateResponse = await app.request("/api/profiles/generate-ai", {
      method: "POST",
      body: JSON.stringify({ input: "jiajun wu" }),
      headers: { "content-type": "application/json" }
    });
    expect(generateResponse.status).toBe(200);
    const generated = await generateResponse.json();
    expect(generated).toMatchObject({
      handle: "jiajun-wu",
      llmUsed: true,
      workspaceUrl: "/u/jiajun-wu/workspace"
    });
    expect(generated.artifactsImported).toBeGreaterThan(1);
    expect(generated.warnings.join(" ")).not.toContain("This profile was generated from user-provided information");

    const profileResponse = await app.request("/api/people/jiajun-wu");
    const profileJson = await profileResponse.json();
    expect(profileJson.sources).toEqual(expect.arrayContaining([expect.objectContaining({ type: "openalex" })]));
    expect(profileJson.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "paper" })]));
    expect(profileJson.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: expect.any(String),
        evidence: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })])
      })
    ]));

    const cardsResponse = await app.request("/api/people/jiajun-wu/cards");
    expect(cardsResponse.status).toBe(200);
    await expect(cardsResponse.json()).resolves.toMatchObject({
      handle: "jiajun-wu",
      cards: expect.arrayContaining([
        expect.objectContaining({
          title: expect.any(String),
          evidence: expect.arrayContaining([expect.objectContaining({ reason: expect.any(String) })])
        })
      ])
    });

    const searchResponse = await app.request("/api/search?q=Jiajun%20Wu%20Stanford%20paper");
    expect(searchResponse.status).toBe(200);
    const searchJson = await searchResponse.json();
    expect(searchJson.results[0]).toMatchObject({
      person: {
        handle: "jiajun-wu"
      },
      profileUrl: "/u/jiajun-wu",
      evidence: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
      matchedArtifacts: expect.arrayContaining([expect.objectContaining({ type: "paper" })])
    });
  });

  it("resolves candidates and requires selection for ambiguous names", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "ambiguous person" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      rawInput: "ambiguous person",
      queryType: "person_name",
      needsSelection: true
    });
    expect(json.candidates.length).toBeGreaterThan(1);
  });

  it("resolves person-name candidates across public connector searches", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "jiajun wu" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.queryType).toBe("person_name");
    expect(json.candidates.length).toBeLessThanOrEqual(8);
    expect(json.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        displayName: "Jiajun Wu",
        sources: expect.arrayContaining([
          expect.objectContaining({ sourceType: "openalex" }),
          expect.objectContaining({ sourceType: "orcid" })
        ])
      }),
      expect.objectContaining({ sourceType: "github", handle: "jiajun-wu" }),
      expect.objectContaining({ sourceType: "arxiv", displayName: "Jiajun Wu" })
    ]));
    expect(json.needsSelection).toBe(true);

    const merged = json.candidates.find((item: { sources?: Array<{ sourceType: string }> }) => item.sources?.some((source) => source.sourceType === "openalex") && item.sources?.some((source) => source.sourceType === "orcid"));
    const generateResponse = await app.request("/api/profiles/generate-from-candidate", {
      method: "POST",
      body: JSON.stringify({ input: "jiajun wu", rawInput: "jiajun wu", candidateId: merged.id, candidate: merged }),
      headers: { "content-type": "application/json" }
    });
    expect(generateResponse.status).toBe(200);
    const generated = await generateResponse.json();
    const profileResponse = await app.request(`/api/people/${generated.handle}/workspace`);
    const profileJson = await profileResponse.json();
    expect(profileJson.profile.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "openalex" }),
      expect.objectContaining({ type: "orcid" })
    ]));
    expect(profileJson.profile.person.headline ?? "").not.toContain("3D Scene Understanding");
  });

  it("keeps typo person discovery on public candidates when context can disambiguate", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (textUrl.startsWith("https://api.openalex.org/authors?")) {
          const decodedUrl = decodeURIComponent(textUrl).toLowerCase().replace(/\+/g, " ");
          if (decodedUrl.includes("andrej")) {
            return Response.json({
              results: [{
                id: "https://openalex.org/A1969205032",
                display_name: "Andrej Karpathy",
                last_known_institutions: [{ display_name: "OpenAI" }],
                works_count: 25,
                cited_by_count: 58_894,
                summary_stats: { h_index: 20 }
              }]
            });
          }
          return Response.json({ results: [] });
        }
        if (
          textUrl.startsWith("https://api.github.com/search/users?")
          || textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")
        ) {
          return Response.json(textUrl.startsWith("https://pub.orcid.org") ? { "expanded-result": [] } : { items: [] });
        }
        if (textUrl.startsWith("https://export.arxiv.org/api/query")) {
          return new Response("<feed></feed>");
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Andrej Karpaty open source llm education" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.candidates[0]).toMatchObject({
      displayName: "Andrej Karpathy",
      sourceType: "openalex"
    });
    expect(json.candidates[0].warnings.join(" ")).not.toContain("user-provided");
  });

  it("creates direct candidates for GitHub URLs and can generate from selected candidates", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const resolveResponse = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "https://github.com/demo-agent-builder" }),
      headers: { "content-type": "application/json" }
    });
    const resolveJson = await resolveResponse.json();
    expect(resolveJson).toMatchObject({
      needsSelection: false,
      candidates: [expect.objectContaining({ sourceType: "github", sourceId: "demo-agent-builder" })]
    });

    const generateResponse = await app.request("/api/profiles/generate-from-candidate", {
      method: "POST",
      body: JSON.stringify({ rawInput: "https://github.com/demo-agent-builder", candidateId: resolveJson.candidates[0].id }),
      headers: { "content-type": "application/json" }
    });

    expect(generateResponse.status).toBe(200);
    await expect(generateResponse.json()).resolves.toMatchObject({
      handle: "demo-agent-builder",
      workspaceUrl: "/u/demo-agent-builder/workspace",
      llmUsed: false
    });
  });

  it("does not claim LLM planning when a direct public candidate is generated without LLM use", async () => {
    const llmClient = {
      completeJson: vi.fn()
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "https://github.com/demo-agent-builder" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      handle: "demo-agent-builder",
      llmUsed: false,
      agentUsed: false
    });
    expect(llmClient.completeJson).not.toHaveBeenCalled();
  });

  it("creates direct candidates for GitHub URLs embedded in natural-language requests", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Research https://github.com/demo-agent-builder and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      needsSelection: false,
      candidates: [expect.objectContaining({ sourceType: "github", sourceId: "demo-agent-builder" })],
      autoSelectedCandidateId: expect.any(String)
    });
  });

  it("agent-search generates from GitHub URLs embedded in natural-language requests", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/agent-search", {
      method: "POST",
      body: JSON.stringify({ input: "Research https://github.com/demo-agent-builder and return profile cards." }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      handle: "demo-agent-builder",
      workspaceUrl: "/u/demo-agent-builder/workspace",
      llmUsed: false
    });
  });

  it("creates direct candidates for public source IDs embedded in natural-language requests", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const orcidResponse = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Research ORCID 0000-0002-1825-0097 and return profile cards." }),
      headers: { "content-type": "application/json" }
    });
    await expect(orcidResponse.json()).resolves.toMatchObject({
      needsSelection: false,
      candidates: [expect.objectContaining({ sourceType: "orcid", sourceId: "0000-0002-1825-0097" })]
    });

    const arxivResponse = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Generate a profile from arXiv 2401.12345." }),
      headers: { "content-type": "application/json" }
    });
    await expect(arxivResponse.json()).resolves.toMatchObject({
      needsSelection: false,
      candidates: [expect.objectContaining({ sourceType: "arxiv", sourceId: "2401.12345" })]
    });

    const openAlexResponse = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Research OpenAlex A5009290031 and return profile cards." }),
      headers: { "content-type": "application/json" }
    });
    await expect(openAlexResponse.json()).resolves.toMatchObject({
      needsSelection: false,
      candidates: [expect.objectContaining({ sourceType: "openalex", sourceId: "A5009290031" })]
    });
  });

  it("does not auto-select invalid GitHub usernames from direct URLs", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "https://github.com/-bad-user" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      queryType: "source_url",
      candidates: [expect.objectContaining({ sourceType: "website", sourceUrl: "https://github.com/-bad-user" })]
    });
  });

  it("creates direct website candidates", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "https://example.com/" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      queryType: "source_url",
      needsSelection: false,
      candidates: [expect.objectContaining({ sourceType: "website", sourceUrl: "https://example.com/" })]
    });
  });

  it("adds connector warnings without failing candidate resolution", async () => {
    const app = createApp({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        if (
          textUrl.startsWith("https://api.openalex.org/authors?")
          || textUrl.startsWith("https://api.github.com/search/users?")
          || textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")
          || textUrl.startsWith("https://export.arxiv.org/api/query")
        ) {
          return new Response("rate limited", { status: 429 });
        }
        return fixtureFetch(url);
      }
    });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "connector failure person" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.candidates).toEqual([]);
    expect(json.warnings.join(" ")).toContain("OpenAlex candidate search was unavailable");
    expect(json.warnings.join(" ")).toContain("GitHub candidate search was unavailable");
    expect(json.warnings.join(" ")).toContain("ORCID candidate search was unavailable");
    expect(json.warnings.join(" ")).toContain("arXiv candidate search was unavailable");
  });

  it("does not convert LLM-only suggestions into resolver candidates", async () => {
    const llmClient = {
      completeJson: vi.fn().mockResolvedValue({
        candidates: [{ displayName: "Invented Person", sourceType: "github", sourceUrl: "https://github.com/invented" }]
      })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ input: "Invented Person" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.candidates).toEqual([]);
    expect(llmClient.completeJson).not.toHaveBeenCalled();
  });

  it("search-and-generate returns candidates for ambiguous queries and creates review workspaces when no candidates are found", async () => {
    const app = createApp({ fetchImpl: fixtureFetch });

    const ambiguousResponse = await app.request("/api/profiles/search-and-generate", {
      method: "POST",
      body: JSON.stringify({ input: "ambiguous person", autoSelect: true }),
      headers: { "content-type": "application/json" }
    });
    const ambiguousJson = await ambiguousResponse.json();
    expect(ambiguousJson).toMatchObject({
      status: "needs_selection",
      needsSelection: true
    });
    expect(ambiguousJson.candidates.length).toBeGreaterThan(1);

    const noCandidateResponse = await app.request("/api/profiles/search-and-generate", {
      method: "POST",
      body: JSON.stringify({ input: "AI product engineer who built an evidence-backed workflow", autoSelect: true }),
      headers: { "content-type": "application/json" }
    });
    expect(noCandidateResponse.status).toBe(200);
    await expect(noCandidateResponse.json()).resolves.toMatchObject({
      status: "needs_review",
      workspaceUrl: "/u/ai-product-engineer-who-built-an-evidence-backed/workspace"
    });
  });

  it("creates a reviewable workspace from natural language without treating user-provided claims as verified evidence", async () => {
    const llmClient = {
      completeJson: vi.fn().mockResolvedValueOnce({
        rawInput: "AI product engineer who built an evidence-backed workflow",
        intent: "manual_profile",
        confidence: 0.84,
        subject: {
          displayName: "AI Product Engineer",
          headline: "Evidence-backed workflow builder"
        },
        sources: [],
        userProvidedClaims: [
          {
            type: "summary",
            text: "Built an evidence-backed workflow",
            confidence: 0.62,
            evidenceStatus: "user_provided"
          }
        ],
        missingEvidence: [
          {
            need: "Public project evidence",
            reason: "The input describes the work but does not include a public source.",
            suggestedSource: "GitHub or website"
          }
        ],
        warnings: ["Add a public source to strengthen this profile."],
        questions: []
      })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/generate-ai", {
      method: "POST",
      body: JSON.stringify({ input: "AI product engineer who built an evidence-backed workflow" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      status: "needs_review",
      llmUsed: true,
      workspaceUrl: "/u/ai-product-engineer/workspace",
      artifactsImported: 1,
      claimsGenerated: 1
    });
    expect(llmClient.completeJson).toHaveBeenCalledTimes(1);

    const workspaceResponse = await app.request("/api/people/ai-product-engineer/workspace");
    expect(workspaceResponse.status).toBe(200);
    const workspaceJson = await workspaceResponse.json();
    expect(workspaceJson.profile.claims[0]).toMatchObject({
      text: "Built an evidence-backed workflow",
      status: "pending"
    });
    expect(workspaceJson.profile.artifacts[0].metadata).toMatchObject({
      source: "manual",
      evidenceStatus: "user_provided"
    });
  });

  it("does not run LLM claim synthesis for source-review fallback profiles", async () => {
    const llmClient = {
      completeJson: vi.fn().mockResolvedValueOnce({
        rawInput: "https://github.com/-bad-user",
        intent: "generate_profile",
        confidence: 0.9,
        subject: { handle: "rate-limited-builder" },
        sources: [{ type: "github", input: "-bad-user", reason: "GitHub URL provided.", confidence: 0.9, evidenceStatus: "explicit" }],
        userProvidedClaims: [],
        missingEvidence: [],
        warnings: [],
        questions: []
      })
    };
    const app = createApp({ fetchImpl: fixtureFetch, llmClient });

    const response = await app.request("/api/profiles/generate-ai", {
      method: "POST",
      body: JSON.stringify({ input: "https://github.com/-bad-user" }),
      headers: { "content-type": "application/json" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "needs_review",
      llmUsed: true,
      artifactsImported: 1,
      claimsGenerated: 1
    });
    expect(llmClient.completeJson).toHaveBeenCalledTimes(1);
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

  if (textUrl.endsWith("/authors/A5018878364")) {
    return Response.json({
      id: "https://openalex.org/A5018878364",
      display_name: "Jiajun Wu",
      orcid: "https://orcid.org/0000-0002-1825-0097",
      last_known_institutions: [{ display_name: "Stanford University" }],
      works_count: 120,
      cited_by_count: 9000
    });
  }

  if (textUrl.startsWith("https://api.openalex.org/authors?")) {
    const decodedUrl = decodeURIComponent(textUrl).toLowerCase();
    if (textUrl.includes("ambiguous")) {
      return Response.json({
        results: [
          {
            id: "https://openalex.org/A111",
            display_name: "Ambiguous Person",
            works_count: 12,
            cited_by_count: 100
          },
          {
            id: "https://openalex.org/A222",
            display_name: "Ambiguous Person",
            works_count: 10,
            cited_by_count: 96
          }
        ]
      });
    }
    if (textUrl.includes("Invented")) {
      return Response.json({ results: [] });
    }
    if (!decodedUrl.includes("jiajun")) {
      return Response.json({ results: [] });
    }
    return Response.json({
      results: [
        {
          id: "https://openalex.org/A5018878364",
          display_name: "Jiajun Wu",
          orcid: "https://orcid.org/0000-0002-1825-0097",
          last_known_institutions: [{ display_name: "Stanford University" }],
          works_count: 120,
          cited_by_count: 9000
        }
      ]
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
    if (textUrl.includes("id_list=")) {
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
    if (!decodeURIComponent(textUrl).toLowerCase().includes("jiajun")) {
      return new Response("<feed></feed>");
    }
    return new Response(`
      <feed>
        <entry>
          <id>https://arxiv.org/abs/2601.01234</id>
          <title>3D Scene Understanding with Structured World Models</title>
          <summary>Research on scene understanding and embodied perception.</summary>
          <published>2026-01-02T00:00:00Z</published>
          <updated>2026-01-03T00:00:00Z</updated>
          <author><name>Jiajun Wu</name></author>
          <author><name>Demo Coauthor</name></author>
          <category term="cs.CV" />
        </entry>
      </feed>
    `);
  }

  if (textUrl.startsWith("https://api.github.com/search/users?")) {
    const decodedUrl = decodeURIComponent(textUrl).toLowerCase();
    const decodedQuery = decodedUrl.replace(/\+/g, " ");
    if (decodedUrl.includes("elonmusk") || decodedQuery.includes("elon musk")) {
      return Response.json({
        items: [
          {
            login: "elonmusk",
            id: 42,
            html_url: "https://github.com/elonmusk",
            type: "User",
            score: 100
          }
        ]
      });
    }
    if (decodedUrl.includes("demo-agent-builder")) {
      return Response.json({
        items: [
          {
            login: "demo-agent-builder",
            id: 12345,
            html_url: "https://github.com/demo-agent-builder",
            type: "User",
            score: 100
          }
        ]
      });
    }
    if (!decodedUrl.includes("jiajun")) {
      return Response.json({ items: [] });
    }
    return Response.json({
      items: [
        {
          login: "jiajun-wu",
          id: 501,
          html_url: "https://github.com/jiajun-wu",
          type: "User",
          score: 42
        }
      ]
    });
  }

  if (textUrl.startsWith("https://pub.orcid.org/v3.0/expanded-search/")) {
    if (!decodeURIComponent(textUrl).toLowerCase().includes("jiajun")) {
      return Response.json({ "expanded-result": [] });
    }
    return Response.json({
      "expanded-result": [
        {
          "orcid-id": "0000-0002-1825-0097",
          "given-names": "Jiajun",
          "family-names": "Wu",
          "credit-name": "Jiajun Wu",
          institution: ["Stanford University"]
        }
      ]
    });
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

  if (textUrl === "https://api.github.com/users/elonmusk") {
    return Response.json(elonmuskGithubUser);
  }

  if (textUrl === "https://api.github.com/users/elonmusk/repos?per_page=100&sort=updated&type=owner") {
    return Response.json(elonmuskGithubRepos);
  }

  if (textUrl.endsWith("/repos?per_page=100&sort=updated&type=owner")) {
    return Response.json(githubRepos);
  }

  return Response.json(githubUser);
}
