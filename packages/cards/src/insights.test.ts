import { describe, expect, it } from "vitest";
import { generateCandidateInsights } from "./insights.js";
import type { CardArtifact, CardClaim, CardPerson } from "./types.js";

const person: CardPerson = {
  handle: "ai-builder",
  displayName: "AI Builder",
  headline: "AI agent engineer building MCP tools",
  bio: "Builds TypeScript automation, model tooling, and evidence-backed developer workflows."
};

const artifacts: CardArtifact[] = [
  {
    id: "repo-1",
    type: "repo",
    title: "ai-builder/agent-tools",
    description: "TypeScript tools for AI agents and MCP workflows",
    url: "https://github.com/ai-builder/agent-tools",
    metadata: {
      language: "TypeScript",
      topics: ["ai-agents", "mcp", "llm"],
      stars: 320,
      forks: 24,
      updatedAt: new Date().toISOString()
    }
  },
  {
    id: "repo-2",
    type: "repo",
    title: "ai-builder/profile-index",
    description: "Evidence-backed profile indexing experiments",
    url: "https://github.com/ai-builder/profile-index",
    metadata: {
      language: "Python",
      topics: ["profiles", "search", "rag"],
      stars: 87,
      forks: 7,
      updatedAt: new Date(Date.now() - 200 * 86_400_000).toISOString()
    }
  }
];

const claims: CardClaim[] = [
  {
    id: "claim-1",
    type: "skill",
    text: "TypeScript MCP agent workflows",
    confidence: 0.9,
    status: "approved",
    evidence: []
  },
  {
    id: "claim-2",
    type: "research_area",
    text: "Language model evaluation researcher",
    confidence: 0.85,
    status: "approved",
    evidence: []
  }
];

describe("generateCandidateInsights", () => {
  it("returns signals for a well-rounded candidate", () => {
    const insights = generateCandidateInsights(person, artifacts, claims);
    expect(insights.signals.length).toBeGreaterThan(0);
  });

  it("detects AI talent signals from artifacts", () => {
    const insights = generateCandidateInsights(person, artifacts, claims);
    const aiSignal = insights.signals.find((s) => s.field === "ai_talent");
    expect(aiSignal).toBeDefined();
    expect(aiSignal?.confidence).toBeGreaterThan(0.5);
  });

  it("detects career momentum from recent artifacts", () => {
    const insights = generateCandidateInsights(person, artifacts, claims);
    const momentumSignal = insights.signals.find((s) => s.field === "career_momentum");
    expect(momentumSignal).toBeDefined();
    expect(momentumSignal?.value).toContain("recent");
  });

  it("detects digital identity from source types", () => {
    const insights = generateCandidateInsights(person, artifacts, claims);
    const identitySignal = insights.signals.find((s) => s.field === "digital_identity");
    expect(identitySignal).toBeDefined();
    expect(identitySignal?.value).toContain("source type");
  });

  it("calculates overall score as average of signal confidences", () => {
    const insights = generateCandidateInsights(person, artifacts, claims);
    expect(insights.overallScore).toBeGreaterThan(0);
    expect(insights.overallScore).toBeLessThanOrEqual(1);
  });

  it("returns no AI talent signal for non-AI artifacts", () => {
    const nonAiArtifacts: CardArtifact[] = [
      {
        id: "repo-1",
        type: "repo",
        title: "builder/cooking-recipes",
        description: "A collection of cooking recipes",
        url: "https://github.com/builder/cooking-recipes",
        metadata: {
          language: "JavaScript",
          topics: ["cooking", "recipes", "food"],
          stars: 10,
          forks: 1,
          updatedAt: new Date().toISOString()
        }
      }
    ];
    const insights = generateCandidateInsights(person, nonAiArtifacts, []);
    const aiSignal = insights.signals.find((s) => s.field === "ai_talent");
    expect(aiSignal).toBeUndefined();
  });

  it("builds a summary string from signals", () => {
    const insights = generateCandidateInsights(person, artifacts, claims);
    expect(insights.summary).toContain("Candidate insights");
    expect(insights.summary).toContain("Overall insight score");
  });
});
