import type { SearchArtifact, SearchEvidenceRef } from "./types.js";

export function artifactEvidence(artifact: SearchArtifact, reason: string, fallbackIndex = 0): SearchEvidenceRef {
  return {
    id: artifact.id ?? artifact.url ?? `${artifact.type}-${fallbackIndex}`,
    type: "artifact",
    title: artifact.title,
    url: artifact.url,
    reason
  };
}

export function dedupeEvidence(evidence: SearchEvidenceRef[]): SearchEvidenceRef[] {
  const seen = new Set<string>();
  const deduped: SearchEvidenceRef[] = [];

  for (const item of evidence) {
    const key = `${item.type}:${item.id}:${item.reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

