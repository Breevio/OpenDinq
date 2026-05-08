import { describe, expect, it } from "vitest";
import { fullTextSearch, hybridSearchPeople } from "./index.js";
import type { PersonSearchDocument, SearchProvider } from "./types.js";

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
        type: "skills",
        title: "Skills",
        contentMd: "Evidence-backed agent workflow and MCP automation experience."
      }
    ]
  },
  {
    person: {
      handle: "paper-builder",
      displayName: "Paper Builder",
      headline: "Research tooling engineer",
      bio: "Turns research papers into reusable indexes"
    },
    artifacts: [
      {
        id: "repo-paper",
        type: "repo",
        title: "paper-builder/index",
        description: "Research paper indexing tools",
        url: "https://github.com/paper-builder/index",
        metadata: {
          language: "Python",
          topics: ["research"],
          stars: 20,
          forks: 1,
          updatedAt: new Date().toISOString()
        }
      }
    ],
    cards: [
      {
        type: "summary",
        title: "Research Summary",
        contentMd: "Maintains semantic scholar ingestion notes and citation workflows."
      }
    ],
    claims: [
      {
        id: "claim-citation",
        type: "research_area",
        text: "Citation graph indexing",
        evidence: [
          {
            id: "repo-paper",
            type: "artifact",
            title: "paper-builder/index",
            url: "https://github.com/paper-builder/index",
            reason: "Repository supports the claim."
          }
        ]
      }
    ]
  }
];

describe("fullTextSearch", () => {
  it("scores profile, artifact, and card text without requiring vectors", () => {
    const results = fullTextSearch(
      {
        queryText: "semantic scholar citation",
        terms: ["semantic", "scholar", "citation"],
        phrases: []
      },
      documents
    );

    expect(results[0]).toMatchObject({
      handle: "paper-builder",
      evidence: expect.arrayContaining([
        expect.objectContaining({
          type: "card",
          title: "Research Summary"
        })
      ])
    });
  });
});

describe("hybridSearchPeople", () => {
  it("preserves evidence and explanations while combining rule and full-text signals", async () => {
    const results = await hybridSearchPeople("AI agent TypeScript MCP", documents);

    expect(results[0]).toMatchObject({
      person: {
        handle: "agent-ts"
      },
      explanation: expect.stringContaining("MCP"),
      evidence: expect.arrayContaining([
        expect.objectContaining({
          id: "repo-agent"
        })
      ])
    });
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("accepts optional vector-like providers without changing result shape", async () => {
    const provider: SearchProvider = {
      name: "fixture-vector",
      search: () => [
        {
          handle: "paper-builder",
          score: 1,
          explanation: "Fixture vector similarity matched research indexing.",
          evidence: [
            {
              id: "repo-paper",
              type: "artifact",
              title: "paper-builder/index",
              url: "https://github.com/paper-builder/index",
              reason: "Fixture semantic match."
            }
          ]
        }
      ]
    };

    const results = await hybridSearchPeople("citation graph", documents, { providers: [provider] });

    expect(results[0]).toMatchObject({
      person: {
        handle: "paper-builder"
      },
      explanation: expect.stringContaining("Fixture vector similarity"),
      evidence: expect.arrayContaining([
        expect.objectContaining({
          reason: "Fixture semantic match."
        })
      ])
    });
  });

  it("matches claim and card content with evidence", async () => {
    const results = await hybridSearchPeople("citation graph", documents);

    expect(results[0]).toMatchObject({
      person: {
        handle: "paper-builder"
      },
      matchedClaims: expect.arrayContaining([
        expect.objectContaining({
          id: "claim-citation"
        })
      ]),
      matchedCards: expect.arrayContaining([
        expect.objectContaining({
          title: "Research Summary"
        })
      ]),
      evidence: expect.arrayContaining([
        expect.objectContaining({
          id: "repo-paper"
        })
      ])
    });
  });
});
