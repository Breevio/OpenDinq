import { describe, expect, it } from "vitest";
import { normalizeClaims, publicRankedClaims, scoreClaimQuality } from "./claim-quality.js";
import type { ProfileClaimRecord } from "./store.js";

const repoEvidence = {
  id: "repo-1",
  type: "artifact",
  title: "demo/agent-tools",
  url: "https://github.com/demo/agent-tools",
  reason: "Repository supports this claim."
} as const;

function claim(overrides: Partial<ProfileClaimRecord>): ProfileClaimRecord {
  return {
    type: "skill",
    text: "TypeScript",
    confidence: 0.7,
    evidence: [repoEvidence],
    status: "approved",
    ...overrides
  };
}

describe("claim quality pipeline", () => {
  it("merges duplicate claims and prefers higher confidence", () => {
    const claims = normalizeClaims([
      claim({ id: "low", text: "TypeScript", confidence: 0.5 }),
      claim({ id: "high", text: "typescript", confidence: 0.9 })
    ]);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ id: "high", confidence: 0.9 });
  });

  it("preserves and merges evidence refs when duplicates are found", () => {
    const claims = normalizeClaims([
      claim({ evidence: [repoEvidence] }),
      claim({
        evidence: [
          {
            id: "source-1",
            type: "source",
            title: "GitHub profile",
            reason: "Source supports the skill."
          }
        ]
      })
    ]);

    expect(claims[0]?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "repo-1" }),
      expect.objectContaining({ id: "source-1" })
    ]));
  });

  it("scores generic claims lower than specific claims", () => {
    const generic = scoreClaimQuality(claim({ text: "Engineer" }));
    const specific = scoreClaimQuality(claim({ text: "Builds TypeScript MCP tools for AI agent workflows" }));

    expect(specific).toBeGreaterThan(generic);
  });

  it("scores evidence-backed claims higher than weak claim-only claims", () => {
    const evidenceBacked = scoreClaimQuality(claim({ text: "Maintains a TypeScript MCP automation repository" }));
    const weak = scoreClaimQuality(claim({
      text: "Maintains a TypeScript MCP automation repository",
      evidence: [{ id: "claim-1", type: "claim", title: "Prior claim", reason: "Claim supports claim." }]
    }));

    expect(evidenceBacked).toBeGreaterThan(weak);
  });

  it("excludes rejected claims from public ranking", () => {
    const ranked = publicRankedClaims([
      claim({ id: "approved", text: "TypeScript MCP tools", status: "approved" }),
      claim({ id: "rejected", text: "TypeScript MCP tools", status: "rejected", confidence: 1 })
    ]);

    expect(ranked.map((item) => item.id)).toEqual(["approved"]);
  });
});
