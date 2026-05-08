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
      location: "Remote"
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
      phrases: []
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
});
