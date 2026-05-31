import type { CardArtifact, EvidenceRef } from "./types.js";

export function buildEvidenceRefs(artifacts: CardArtifact[], reason = "Source artifact supports this card."): EvidenceRef[] {
  return artifacts.map((artifact, index) => ({
    id: artifact.id ?? artifact.url ?? `${artifact.type}-${index}`,
    type: "artifact",
    title: artifact.title,
    url: artifact.url,
    reason
  }));
}

