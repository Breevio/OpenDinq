import { describe, expect, it } from "vitest";
import { parseSearchQuery, rankPeople, searchPeople } from "./index.js";
import type { PersonSearchDocument } from "./types.js";

const documents: PersonSearchDocument[] = [
  {
    person: {
      handle: "agent-ts",
      displayName: "Agent TypeScript Builder",
      headline: "AI agent engineer",
      bio: "Builds MCP tools",
      location: "Remote",
      publicStatus: "published"
    },
    artifacts: [
      {
        id: "repo-agent",
        type: "repo",
        title: "agent-ts/mcp-tools",
        description: "TypeScript tools for AI agent workflows and MCP servers",
        url: "https://github.com/agent-ts/mcp-tools",
        metadata: {
          language: "TypeScript",
          topics: ["ai-agents", "mcp"],
          stars: 420,
          forks: 32,
          updatedAt: new Date().toISOString()
        }
      }
    ],
    cards: [
      {
        id: "card-agent-skills",
        type: "skills",
        title: "Agent skills",
        contentMd: "TypeScript MCP agent workflows",
        dataJson: { skills: ["TypeScript", "MCP"] }
      }
    ],
    claims: [
      {
        id: "claim-agent",
        type: "skill",
        text: "AI agent workflows",
        confidence: 0.8,
        qualityScore: 0.9,
        status: "approved",
        evidence: [{ id: "repo-agent", type: "artifact", title: "agent-ts/mcp-tools", reason: "Repo supports claim." }]
      }
    ]
  },
  {
    person: {
      handle: "rust-systems",
      displayName: "Rust Systems Maintainer",
      headline: "Systems engineer",
      bio: "Maintains fast runtime tools"
    },
    artifacts: [
      {
        id: "repo-rust",
        type: "repo",
        title: "rust-systems/runtime",
        description: "Rust systems programming runtime",
        url: "https://github.com/rust-systems/runtime",
        metadata: {
          language: "Rust",
          topics: ["systems", "runtime"],
          stars: 240,
          forks: 18,
          updatedAt: new Date(Date.now() - 30 * 86_400_000).toISOString()
        }
      }
    ]
  },
  {
    person: {
      handle: "frontend-only",
      displayName: "Frontend Developer"
    },
    artifacts: [
      {
        id: "repo-css",
        type: "repo",
        title: "frontend-only/styles",
        description: "CSS component experiments",
        url: "https://github.com/frontend-only/styles",
        metadata: {
          language: "CSS",
          topics: ["design"],
          stars: 3,
          forks: 0,
          updatedAt: "2024-01-01T00:00:00Z"
        }
      }
    ]
  }
];

describe("parseSearchQuery", () => {
  it("normalizes query terms", () => {
    expect(parseSearchQuery("AI agent TypeScript MCP")).toEqual({
      queryText: "AI agent TypeScript MCP",
      terms: ["ai", "agent", "typescript", "mcp"],
      phrases: [],
      intent: expect.objectContaining({
        skills: ["typescript", "mcp"]
      })
    });
  });
});

describe("rule-based people search", () => {
  it("matches AI agent TypeScript MCP repositories", () => {
    const results = searchPeople("AI agent TypeScript MCP", documents);

    expect(results[0]?.person.handle).toBe("agent-ts");
    expect(results[0]?.explanation).toContain("MCP");
    expect(results[0]?.evidence).toContainEqual(
      expect.objectContaining({
        id: "repo-agent",
        reason: expect.stringContaining("Matched")
      })
    );
  });

  it("returns matched claims and cards for full-text matches", async () => {
    const results = await import("./index.js").then(({ hybridSearchPeople }) => hybridSearchPeople("agent workflows", documents));

    expect(results[0]?.person.handle).toBe("agent-ts");
    expect(results[0]?.matchedClaims).toEqual(expect.arrayContaining([expect.objectContaining({ id: "claim-agent" })]));
    expect(results[0]?.matchedCards).toEqual(expect.arrayContaining([expect.objectContaining({ id: "card-agent-skills" })]));
    expect(results[0]?.matchedArtifacts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "repo-agent" })]));
    expect(results[0]?.topSkills).toEqual(expect.arrayContaining(["TypeScript", "MCP"]));
    expect(results[0]?.profileUrl).toBe("/u/agent-ts");
    expect(results[0]?.scoreBreakdown).toEqual(expect.objectContaining({ finalScore: expect.any(Number) }));
    expect(results[0]?.evidence.length).toBeGreaterThan(0);
  });

  it("matches Rust systems engineer profiles", () => {
    const results = searchPeople("Rust systems engineer", documents);

    expect(results[0]?.person.handle).toBe("rust-systems");
    expect(results[0]?.evidence[0]?.id).toBe("repo-rust");
  });

  it("scores irrelevant profiles lower", () => {
    const ranked = rankPeople("AI agent TypeScript MCP", documents);
    const agentScore = ranked.find((result) => result.person.handle === "agent-ts")?.score ?? 0;
    const frontendScore = ranked.find((result) => result.person.handle === "frontend-only")?.score ?? 0;

    expect(agentScore).toBeGreaterThan(frontendScore);
  });

  it("returns evidence-backed results only", () => {
    const results = searchPeople("runtime", documents);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.evidence.length > 0)).toBe(true);
    expect(results.every((result) => result.explanation.length > 0)).toBe(true);
  });

  it("applies a small published profile boost", async () => {
    const unpublished = structuredClone(documents);
    if (unpublished[0]) {
      unpublished[0].person.publicStatus = "draft";
    }

    const publishedScore = (await import("./index.js").then(({ hybridSearchPeople }) => hybridSearchPeople("agent workflows", documents)))[0]?.score ?? 0;
    const draftScore = (await import("./index.js").then(({ hybridSearchPeople }) => hybridSearchPeople("agent workflows", unpublished)))[0]?.score ?? 0;

    expect(publishedScore).toBeGreaterThan(draftScore);
  });

  it("does not score rejected claims or hidden cards", async () => {
    const hiddenOnly: PersonSearchDocument[] = [{
      person: { handle: "hidden", displayName: "Hidden Match" },
      artifacts: [],
      cards: [{ id: "hidden-card", type: "skills", title: "Kubernetes", contentMd: "Kubernetes", visibility: "hidden" }],
      claims: [{ id: "rejected-claim", type: "skill", text: "Kubernetes", status: "rejected", evidence: [{ id: "repo-k8s", type: "artifact", title: "k8s", reason: "Rejected." }] }]
    }];

    const results = await import("./index.js").then(({ hybridSearchPeople }) => hybridSearchPeople("Kubernetes", hiddenOnly));

    expect(results).toHaveLength(0);
  });

  it("ranks exact phrase matches above weak token matches", async () => {
    const docs: PersonSearchDocument[] = [
      {
        person: { handle: "exact", displayName: "Exact" },
        artifacts: [{ id: "repo-exact", type: "repo", title: "eval-kit", description: "language model evaluation researcher", metadata: {} }]
      },
      {
        person: { handle: "weak", displayName: "Weak" },
        artifacts: [{ id: "repo-weak", type: "repo", title: "language-tools", description: "model utilities", metadata: {} }]
      }
    ];

    const results = await import("./index.js").then(({ hybridSearchPeople }) => hybridSearchPeople("\"language model evaluation\"", docs));

    expect(results[0]?.person.handle).toBe("exact");
  });

  it("ranks evidence-backed claim matches above unsupported profile text", async () => {
    const docs: PersonSearchDocument[] = [
      {
        person: { handle: "evidence", displayName: "Evidence" },
        artifacts: [{ id: "repo-eval", type: "repo", title: "eval-kit", description: "benchmark tooling", metadata: {} }],
        claims: [{ id: "claim-eval", type: "research_area", text: "language model evaluation", qualityScore: 0.9, evidence: [{ id: "repo-eval", type: "artifact", title: "eval-kit", reason: "Repo supports evaluation." }] }]
      },
      {
        person: { handle: "text", displayName: "Text", bio: "language model evaluation" },
        artifacts: []
      }
    ];

    const results = await import("./index.js").then(({ hybridSearchPeople }) => hybridSearchPeople("language model evaluation", docs));

    expect(results[0]?.person.handle).toBe("evidence");
    expect(results[0]?.scoreBreakdown.claimScore).toBeGreaterThan(0);
  });
});
