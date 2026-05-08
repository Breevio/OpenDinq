import { artifactEvidence, cardEvidence, claimEvidence, dedupeEvidence, personEvidence } from "./evidence.js";
import { tokenize } from "./query.js";
import type { ParsedSearchQuery, PersonSearchDocument, SearchProviderMatch } from "./types.js";

export function fullTextSearch(query: ParsedSearchQuery, documents: PersonSearchDocument[]): SearchProviderMatch[] {
  return documents
    .map((document) => scoreDocument(query, document))
    .filter((match) => match.score > 0 && match.evidence.length > 0)
    .sort((left, right) => right.score - left.score || left.handle.localeCompare(right.handle));
}

function scoreDocument(query: ParsedSearchQuery, document: PersonSearchDocument): SearchProviderMatch {
  const evidence: SearchProviderMatch["evidence"] = [];
  let matchedFields = 0;
  let weightedMatches = 0;

  const personText = tokenize(
    `${document.person.displayName} ${document.person.headline ?? ""} ${document.person.bio ?? ""} ${document.person.location ?? ""}`
  );
  const personScore = scoreTokens(query, personText);
  if (personScore > 0) {
    matchedFields += 1;
    weightedMatches += personScore * 0.25;
    evidence.push(personEvidence(document.person, "Matched profile text."));
  }

  document.artifacts.forEach((artifact, index) => {
    const artifactTokens = tokenize(
      `${artifact.title} ${artifact.description ?? ""} ${metadataText(artifact.metadata)}`
    );
    const artifactScore = scoreTokens(query, artifactTokens);
    if (artifactScore > 0) {
      matchedFields += 1;
      weightedMatches += artifactScore * 0.55;
      evidence.push(artifactEvidence(artifact, "Matched full-text artifact content.", index));
    }
  });

  document.cards?.forEach((card, index) => {
    const cardTokens = tokenize(`${card.type} ${card.title} ${card.contentMd} ${metadataText(card.dataJson)}`);
    const cardScore = scoreTokens(query, cardTokens);
    if (cardScore > 0) {
      matchedFields += 1;
      weightedMatches += cardScore * 0.2;
      evidence.push(cardEvidence(card, "Matched generated card content.", index));
    }
  });

  document.claims?.forEach((claim, index) => {
    const claimTokens = tokenize(`${claim.type} ${claim.text}`);
    const claimScore = scoreTokens(query, claimTokens);
    if (claimScore > 0) {
      matchedFields += 1;
      weightedMatches += claimScore * 0.35;
      evidence.push(claimEvidence(claim, "Matched profile claim.", index));
      evidence.push(...(claim.evidence ?? []));
    }
  });

  const coverage = query.terms.length === 0 ? 0 : Math.min(1, matchedFields / Math.max(1, query.terms.length));

  return {
    handle: document.person.handle,
    score: roundScore(Math.min(1, weightedMatches + coverage * 0.15)),
    explanation: "Full-text match across profile, artifacts, or cards.",
    evidence: dedupeEvidence(evidence)
  };
}

function scoreTokens(query: ParsedSearchQuery, tokens: string[]): number {
  if (tokens.length === 0 || query.terms.length === 0) {
    return 0;
  }

  const tokenSet = new Set(tokens);
  const matchedTerms = query.terms.filter((term) => tokenSet.has(term));
  const phraseText = tokens.join(" ");
  const matchedPhrases = query.phrases.filter((phrase) => phraseText.includes(phrase));

  return Math.min(1, matchedTerms.length / query.terms.length + matchedPhrases.length * 0.25);
}

function metadataText(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) {
    return "";
  }

  return Object.values(metadata)
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
      }

      return typeof value === "string" || typeof value === "number" ? String(value) : "";
    })
    .join(" ");
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
