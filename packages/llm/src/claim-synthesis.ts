import { z } from "zod";
import type { JsonLlmClient } from "./profile-intent-planner.js";

export type SynthesisEvidenceRef = {
  id: string;
  type: "artifact" | "claim" | "source" | "external";
  title: string;
  url?: string;
  reason: string;
};

export type SynthesisClaim = {
  id?: string;
  type: "skill" | "role" | "project" | "research_area" | "achievement" | "affiliation" | "link" | "summary";
  text: string;
  confidence: number;
  evidence: SynthesisEvidenceRef[];
};

export type ClaimSynthesisInput = {
  inferredPerson: Record<string, unknown>;
  sources: unknown[];
  artifacts: Array<{ id?: string; title: string; url?: string; type: string; description?: string; metadata?: Record<string, unknown> }>;
  deterministicClaims: SynthesisClaim[];
};

const proposedClaimSchema = z.object({
  type: z.enum(["skill", "role", "project", "research_area", "achievement", "affiliation", "link", "summary"]),
  text: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(z.object({ id: z.string().min(1) })).min(1)
});

const proposedClaimsSchema = z.array(proposedClaimSchema);

export async function synthesizeClaimsWithEvidence(input: ClaimSynthesisInput, client?: JsonLlmClient): Promise<SynthesisClaim[]> {
  if (!client) {
    return input.deterministicClaims;
  }

  try {
    const evidence = evidenceFromInput(input);
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const json = await client.completeJson({
      system: CLAIM_SYNTHESIS_SYSTEM_PROMPT,
      user: JSON.stringify({ ...input, allowedEvidenceRefs: evidence })
    });
    const proposed = proposedClaimsSchema.parse(json);
    const accepted = proposed.flatMap((claim, index): SynthesisClaim[] => {
      const claimEvidence = claim.evidenceRefs.map((ref) => evidenceById.get(ref.id)).filter((item): item is SynthesisEvidenceRef => Boolean(item));
      if (claimEvidence.length === 0 || claimEvidence.length !== claim.evidenceRefs.length) {
        return [];
      }
      return [{
        id: `llm-claim-${index}`,
        type: claim.type,
        text: claim.text,
        confidence: claim.confidence,
        evidence: claimEvidence
      }];
    });
    return accepted.length ? [...input.deterministicClaims, ...accepted] : input.deterministicClaims;
  } catch {
    return input.deterministicClaims;
  }
}

export const CLAIM_SYNTHESIS_SYSTEM_PROMPT = [
  "Synthesize evidence-backed OpenDinq profile claims.",
  "Output strict JSON array only.",
  "Every claim must cite at least one allowedEvidenceRefs id.",
  "Do not invent companies, titles, projects, papers, or skills.",
  "You may combine multiple evidence refs into one higher-level claim.",
  "Discard anything that cannot be grounded in allowed evidence."
].join("\n");

function evidenceFromInput(input: ClaimSynthesisInput): SynthesisEvidenceRef[] {
  const artifactEvidence = input.artifacts.map((artifact, index) => ({
    id: artifact.id ?? artifact.url ?? `artifact-${index}`,
    type: "artifact" as const,
    title: artifact.title,
    url: artifact.url,
    reason: "Artifact is available as profile evidence."
  }));
  const claimEvidence = input.deterministicClaims.flatMap((claim) => claim.evidence);
  const byKey = new Map([...artifactEvidence, ...claimEvidence].map((item) => [`${item.type}:${item.id}`, item]));
  return [...byKey.values()];
}
