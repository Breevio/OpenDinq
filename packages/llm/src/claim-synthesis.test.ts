import { describe, expect, it, vi } from "vitest";
import { synthesizeClaimsWithEvidence, type ClaimSynthesisInput, type JsonLlmClient } from "./index.js";

const input: ClaimSynthesisInput = {
  inferredPerson: { displayName: "Demo Builder" },
  sources: [],
  artifacts: [{ id: "repo-1", type: "repo", title: "agent-tools", description: "TypeScript MCP tools" }],
  deterministicClaims: [{
    id: "claim-det",
    type: "skill",
    text: "TypeScript",
    confidence: 0.7,
    evidence: [{ id: "repo-1", type: "artifact", title: "agent-tools", reason: "Repo evidence." }]
  }]
};

describe("LLM claim synthesis", () => {
  it("accepts an LLM claim with valid evidence", async () => {
    const claims = await synthesizeClaimsWithEvidence(input, clientFor([
      { type: "project", text: "Builds TypeScript MCP tools", confidence: 0.9, evidenceRefs: [{ id: "repo-1" }] }
    ]));

    expect(claims).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Builds TypeScript MCP tools" })]));
  });

  it("rejects claims without evidence", async () => {
    const claims = await synthesizeClaimsWithEvidence(input, clientFor([
      { type: "project", text: "Unsupported", confidence: 0.9, evidenceRefs: [] }
    ]));

    expect(claims).toEqual(input.deterministicClaims);
  });

  it("rejects hallucinated evidence ids", async () => {
    const claims = await synthesizeClaimsWithEvidence(input, clientFor([
      { type: "achievement", text: "Won an award", confidence: 0.9, evidenceRefs: [{ id: "missing" }] }
    ]));

    expect(claims).toEqual(input.deterministicClaims);
  });

  it("falls back when the LLM fails", async () => {
    const client: JsonLlmClient = { completeJson: vi.fn().mockRejectedValue(new Error("fail")) };

    await expect(synthesizeClaimsWithEvidence(input, client)).resolves.toEqual(input.deterministicClaims);
  });
});

function clientFor(output: unknown): JsonLlmClient {
  return { completeJson: vi.fn().mockResolvedValue(output) };
}
