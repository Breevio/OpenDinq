import type { SearchArtifact, SearchCard, SearchEvidenceRef, SearchPerson } from "./types.js";

export function artifactEvidence(artifact: SearchArtifact, reason: string, fallbackIndex = 0): SearchEvidenceRef {
  return {
    id: artifact.id ?? artifact.url ?? `${artifact.type}-${fallbackIndex}`,
    type: "artifact",
    title: artifact.title,
    url: artifact.url,
    reason
  };
}

export function cardEvidence(card: SearchCard, reason: string, fallbackIndex = 0): SearchEvidenceRef {
  return {
    id: `card-${card.type}-${fallbackIndex}`,
    type: "card",
    title: card.title,
    reason
  };
}

export function personEvidence(person: SearchPerson, reason: string): SearchEvidenceRef {
  return {
    id: `person-${person.handle}`,
    type: "person",
    title: person.displayName,
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
