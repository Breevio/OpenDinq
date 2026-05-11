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
      workspaceUrl: "/u/demo-agent-builder/workspace"
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
    if (!decodeURIComponent(textUrl).toLowerCase().includes("jiajun")) {
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

  if (textUrl.endsWith("/repos?per_page=100&sort=updated&type=owner")) {
    return Response.json(githubRepos);
  }

  return Response.json(githubUser);
}
