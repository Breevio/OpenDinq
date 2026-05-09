import { describe, expect, it, vi } from "vitest";
import { isLlmRewriteEnabled, rewriteCardWithEvidence, type LlmRewriteClient, type LlmRewriteInput } from "./index.js";

const input: LlmRewriteInput = {
  draftCard: {
    title: "Demo skills",
    contentMd: "## Skills\n- TypeScript MCP tools",
    evidence: [{ id: "repo-1", type: "artifact", title: "agent-tools", reason: "Repository supports TypeScript MCP tools." }],
    claimIds: ["claim-1"]
  },
  allowedClaims: [
    {
      id: "claim-1",
      type: "skill",
      text: "Builds TypeScript MCP tools",
      evidence: [{ id: "repo-1", type: "artifact", title: "agent-tools", reason: "Repository supports TypeScript MCP tools." }]
    }
  ],
  evidence: [{ id: "repo-1", type: "artifact", title: "agent-tools", reason: "Repository supports TypeScript MCP tools." }]
};

describe("evidence-constrained LLM rewrite", () => {
  it("uses a valid rewrite from the client", async () => {
    const client: LlmRewriteClient = {
      rewrite: vi.fn().mockResolvedValue({
        rewrittenMarkdown: "## Skills\nBuilds TypeScript MCP tools.",
        usedClaimIds: ["claim-1"],
        usedEvidenceIds: ["repo-1"]
      })
    };

    await expect(rewriteCardWithEvidence(input, client)).resolves.toMatchObject({
      contentMd: "## Skills\nBuilds TypeScript MCP tools.",
      claimIds: ["claim-1"],
      evidence: [expect.objectContaining({ id: "repo-1" })]
    });
  });

  it("falls back to deterministic card when the client fails", async () => {
    const client: LlmRewriteClient = {
      rewrite: vi.fn().mockRejectedValue(new Error("network"))
    };

    await expect(rewriteCardWithEvidence(input, client)).resolves.toEqual(input.draftCard);
  });

  it("falls back when the output adds unsupported facts", async () => {
    const client: LlmRewriteClient = {
      rewrite: vi.fn().mockResolvedValue({
        rewrittenMarkdown: "## Skills\nBuilds Kubernetes billing systems for enterprise teams.",
        usedClaimIds: ["claim-1"],
        usedEvidenceIds: ["repo-1"]
      })
    };

    await expect(rewriteCardWithEvidence(input, client)).resolves.toEqual(input.draftCard);
  });

  it("is disabled unless env and key are present", () => {
    expect(isLlmRewriteEnabled({ OPEN_DINQ_ENABLE_LLM_REWRITE: "true" })).toBe(false);
    expect(isLlmRewriteEnabled({ OPEN_DINQ_ENABLE_LLM_REWRITE: "true", OPENAI_API_KEY: "key" })).toBe(true);
  });
});
