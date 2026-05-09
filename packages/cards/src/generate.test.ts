import { describe, expect, it } from "vitest";
import { buildEvidenceRefs, generateGitHubCard, generateProfileCards, generateSkillsCard, generateSummaryCard } from "./index.js";
import type { CardArtifact, CardClaim, CardPerson } from "./types.js";

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

  it("assigns stable ids, public visibility, and product card ordering", () => {
    const cards = generateProfileCards(person, artifacts, [
      {
        id: "claim-skill",
        type: "skill",
        text: "TypeScript",
        confidence: 0.8,
        evidence: [{ id: "repo-1", type: "artifact", title: "demo/agent-tools", reason: "Repo evidence." }]
      }
    ]);

    expect(cards.map((card) => card.type)).toEqual(["summary", "skills", "works", "timeline"]);
    expect(cards.every((card) => card.id && card.personId === "demo" && card.visibility === "public")).toBe(true);
    expect(cards.every((card) => card.evidence.length > 0)).toBe(true);
  });

  it("does not generate unsupported claims from low evidence", () => {
    const cards = generateProfileCards(person, artifacts, [
      {
        id: "claim-unsupported",
        type: "skill",
        text: "Kubernetes",
        confidence: 1,
        status: "rejected",
        evidence: [{ id: "repo-1", type: "artifact", title: "demo/agent-tools", reason: "Rejected by reviewer." }]
      }
    ]);

    expect(cards.map((card) => card.contentMd).join("\n")).not.toContain("Kubernetes");
  });

  it("keeps low-data profiles honest and useful", () => {
    const cards = generateProfileCards(person, [artifacts[0] as CardArtifact], []);

    expect(cards.find((card) => card.type === "summary")?.contentMd).toContain("AI agent engineer");
    expect(cards.every((card) => card.evidence.length > 0)).toBe(true);
  });

  it("does not create a fake research card without research data", () => {
    const cards = generateProfileCards(person, artifacts, []);

    expect(cards.some((card) => card.type === "research")).toBe(false);
  });

  it("ranks stronger works higher", () => {
    const weak: CardArtifact = {
      id: "repo-weak",
      type: "repo",
      title: "demo/weak",
      description: "Older small repo",
      metadata: { stars: 1, forks: 0, updatedAt: "2020-01-01T00:00:00Z" }
    };
    const card = generateProfileCards(person, [weak, ...artifacts], [projectClaim("repo-1")]).find((item) => item.type === "works");

    expect(card?.contentMd.indexOf("demo/agent-tools")).toBeLessThan(card?.contentMd.indexOf("demo/weak") ?? Number.MAX_SAFE_INTEGER);
  });

  it("regenerated cards preserve evidence metadata", () => {
    const claim: CardClaim = projectClaim("repo-1");
    const card = generateProfileCards(person, artifacts, [claim]).find((item) => item.type === "works");

    expect(card?.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ id: "repo-1" })]));
    expect(card?.dataJson).toEqual(expect.objectContaining({
      evidenceCount: expect.any(Number),
      generatedFromClaimIds: ["claim-project"]
    }));
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

function projectClaim(artifactId: string): CardClaim {
  return {
    id: "claim-project",
    type: "project",
    text: "Built TypeScript tools for AI agent workflows",
    artifactId,
    confidence: 0.9,
    qualityScore: 0.9,
    evidence: [{ id: artifactId, type: "artifact", title: "demo/agent-tools", reason: "Repo supports project claim." }]
  };
}
