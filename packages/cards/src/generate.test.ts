import { describe, expect, it } from "vitest";
import { buildEvidenceRefs, generateGitHubCard, generateSkillsCard, generateSummaryCard } from "./index.js";
import type { CardArtifact, CardPerson } from "./types.js";

const person: CardPerson = {
  handle: "demo",
  displayName: "Demo Builder",
  headline: "AI agent engineer"
};

const artifacts: CardArtifact[] = [
  {
    id: "repo-1",
    type: "repo",
    title: "demo/agent-tools",
    description: "TypeScript tools for AI agents and MCP workflows",
    url: "https://github.com/demo/agent-tools",
    metadata: {
      stars: 320,
      forks: 24,
      language: "TypeScript",
      topics: ["ai-agents", "mcp"],
      updatedAt: "2026-04-21T12:00:00Z"
    }
  },
  {
    id: "repo-2",
    type: "repo",
    title: "demo/rust-index",
    description: "Fast profile indexing engine",
    url: "https://github.com/demo/rust-index",
    metadata: {
      stars: 120,
      forks: 8,
      language: "Rust",
      topics: ["search"],
      updatedAt: "2026-04-22T12:00:00Z"
    }
  }
];

describe("deterministic card generation", () => {
  it("generates a summary card with evidence", () => {
    const card = generateSummaryCard(person, artifacts);

    expect(card.type).toBe("summary");
    expect(card.contentMd).toContain("Demo Builder");
    expect(card.evidence).toHaveLength(2);
  });

  it("generates a GitHub card with top repositories by stars before recency", () => {
    const card = generateGitHubCard(person, artifacts);

    expect(card.contentMd.indexOf("demo/agent-tools")).toBeLessThan(card.contentMd.indexOf("demo/rust-index"));
    expect(card.evidence[0]?.id).toBe("repo-1");
  });

  it("generates a skills card from evidence only", () => {
    const card = generateSkillsCard(person, artifacts);

    expect(card.dataJson?.skills).toEqual(["Ai Agents", "Mcp", "Rust", "Search", "TypeScript"]);
    expect(card.contentMd).not.toContain("Kubernetes");
    expect(card.evidence.length).toBeGreaterThan(0);
  });

  it("is stable between runs", () => {
    expect(generateSkillsCard(person, artifacts)).toEqual(generateSkillsCard(person, artifacts));
    expect(generateGitHubCard(person, artifacts)).toEqual(generateGitHubCard(person, artifacts));
  });

  it("builds fallback evidence ids", () => {
    expect(buildEvidenceRefs([{ type: "note", title: "Manual note" }])).toEqual([
      {
        id: "note-0",
        type: "artifact",
        title: "Manual note",
        reason: "Source artifact supports this card."
      }
    ]);
  });

  it("rejects cards without evidence artifacts", () => {
    expect(() => generateSummaryCard(person, [])).toThrow(
      "Cannot generate summary card without evidence artifacts."
    );
    expect(() => generateGitHubCard(person, [])).toThrow(
      "Cannot generate GitHub card without evidence artifacts."
    );
    expect(() => generateSkillsCard(person, [])).toThrow(
      "Cannot generate skills card without evidence artifacts."
    );
  });
});
