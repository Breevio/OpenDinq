import { describe, expect, it } from "vitest";
import { applySearchFilters, collectFacets } from "./filters.js";
import type { PersonSearchDocument, RankedSearchResult } from "./types.js";

const documents: PersonSearchDocument[] = [
  {
    person: {
      handle: "agent-ts",
      displayName: "Agent TS",
      headline: "AI engineer",
      bio: "Builds MCP tools",
      location: "Remote"
    },
    artifacts: [
      {
        id: "repo-1",
        type: "repo",
        title: "agent-ts/mcp-tools",
        description: "TypeScript MCP tools",
        url: "https://github.com/agent-ts/mcp-tools",
        metadata: { language: "TypeScript", topics: ["ai-agents", "mcp"], stars: 100, forks: 10, updatedAt: new Date().toISOString() }
      }
    ],
    cards: [],
    claims: [{ id: "claim-1", type: "skill", text: "TypeScript", confidence: 0.9, status: "approved", evidence: [] }]
  },
  {
    person: {
      handle: "rust-dev",
      displayName: "Rust Dev",
      headline: "Systems engineer",
      bio: "Builds runtimes",
      location: "Berlin"
    },
    artifacts: [
      {
        id: "repo-2",
        type: "repo",
        title: "rust-dev/runtime",
        description: "Rust async runtime",
        url: "https://github.com/rust-dev/runtime",
        metadata: { language: "Rust", topics: ["systems", "async"], stars: 200, forks: 20, updatedAt: new Date().toISOString() }
      }
    ],
    cards: [],
    claims: [{ id: "claim-2", type: "skill", text: "Rust", confidence: 0.91, status: "approved", evidence: [] }]
  }
];

function buildResults(): RankedSearchResult[] {
  return documents.map((document, index) => ({
    person: document.person,
    score: 0.9 - index * 0.1,
    scoreBreakdown: {
      claimScore: 0.5,
      cardScore: 0,
      artifactScore: 0.25,
      skillScore: 0.25,
      evidenceScore: 0.5,
      publishBoost: 0,
      recencyScore: 1,
      finalScore: 0.9 - index * 0.1
    },
    explanation: "match",
    evidence: [],
    topSkills: document.claims?.filter((c) => c.type === "skill").map((c) => c.text) ?? [],
    matchedArtifacts: document.artifacts
  }));
}

describe("applySearchFilters", () => {
  it("returns all results when no filters are active", () => {
    const results = applySearchFilters(buildResults(), {});
    expect(results).toHaveLength(2);
  });

  it("filters by skill", () => {
    const results = applySearchFilters(buildResults(), { skills: ["TypeScript"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.person.handle).toBe("agent-ts");
  });

  it("filters by location", () => {
    const results = applySearchFilters(buildResults(), { locations: ["Berlin"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.person.handle).toBe("rust-dev");
  });

  it("filters by sourceType", () => {
    const results = applySearchFilters(buildResults(), { sourceTypes: ["repo"] });
    expect(results).toHaveLength(2);
  });

  it("filters by minScore", () => {
    const results = applySearchFilters(buildResults(), { minScore: 0.85 });
    expect(results).toHaveLength(1);
    expect(results[0]?.person.handle).toBe("agent-ts");
  });

  it("filters by minArtifacts", () => {
    const results = applySearchFilters(buildResults(), { minArtifacts: 2 });
    expect(results).toHaveLength(0);
  });

  it("combines multiple filters", () => {
    const results = applySearchFilters(buildResults(), { skills: ["Rust"], locations: ["Berlin"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.person.handle).toBe("rust-dev");
  });
});

describe("collectFacets", () => {
  it("collects skill facets with counts", () => {
    const facets = collectFacets(documents);
    const skillFacet = facets.find((f) => f.field === "skill");
    expect(skillFacet).toBeDefined();
    expect(skillFacet?.values.length).toBeGreaterThan(0);
  });

  it("collects location facets", () => {
    const facets = collectFacets(documents);
    const locationFacet = facets.find((f) => f.field === "location");
    expect(locationFacet).toBeDefined();
    expect(locationFacet?.values.length).toBe(2);
  });

  it("collects sourceType facets", () => {
    const facets = collectFacets(documents);
    const sourceTypeFacet = facets.find((f) => f.field === "sourceType");
    expect(sourceTypeFacet).toBeDefined();
    expect(sourceTypeFacet?.values.find((v) => v.value === "repo")).toBeDefined();
  });

  it("returns facets in consistent order", () => {
    const facets1 = collectFacets(documents);
    const facets2 = collectFacets(documents);
    expect(facets1.map((f) => f.field)).toEqual(facets2.map((f) => f.field));
  });
});
