import { dedupeEvidence } from "./evidence.js";
import { fullTextSearch } from "./full-text.js";
import { parseSearchQuery } from "./query.js";
import { searchPeople } from "./rank.js";
import type {
  HybridSearchOptions,
  PersonSearchDocument,
  RankedSearchResult,
  SearchEvidenceRef,
  SearchProviderMatch
} from "./types.js";

const DEFAULT_WEIGHTS = {
  rule: 0.7,
  fullText: 0.3,
  provider: 0
} as const;

const PROVIDER_WEIGHTS = {
  rule: 0.55,
  fullText: 0.25,
  provider: 0.2
} as const;

export async function hybridSearchPeople(
  queryText: string,
  documents: PersonSearchDocument[],
  options: HybridSearchOptions = {}
): Promise<RankedSearchResult[]> {
  const parsedQuery = parseSearchQuery(queryText);
  const weights = options.weights ?? (options.providers?.length ? PROVIDER_WEIGHTS : DEFAULT_WEIGHTS);
  const byHandle = new Map(documents.map((document) => [document.person.handle, document]));
  const merged = new Map<string, MergedSearchResult>();

  for (const result of searchPeople(queryText, documents)) {
    addWeightedMatch(merged, result.person.handle, result.score, weights.rule, result.explanation, result.evidence);
  }

  for (const result of fullTextSearch(parsedQuery, documents)) {
    addWeightedMatch(merged, result.handle, result.score, weights.fullText, result.explanation, result.evidence);
  }

  for (const provider of options.providers ?? []) {
    const providerMatches = await provider.search(parsedQuery, documents);
    for (const result of providerMatches) {
      addWeightedMatch(
        merged,
        result.handle,
        result.score,
        weights.provider / Math.max(1, options.providers?.length ?? 1),
        result.explanation ?? `${provider.name} match.`,
        result.evidence
      );
    }
  }

  const results: RankedSearchResult[] = [];
  for (const [handle, result] of merged.entries()) {
      const document = byHandle.get(handle);
      if (!document) {
        continue;
      }

      const ranked: RankedSearchResult = {
        person: document.person,
        score: roundScore(Math.min(1, result.score)),
        explanation: mergeExplanations(document.person.displayName, result.explanations),
        evidence: dedupeEvidence(result.evidence),
        matchedClaims: matchedClaims(document, result.evidence),
        matchedCards: matchedCards(document, result.evidence)
      };

      if (ranked.score > 0 && ranked.evidence.length > 0) {
        results.push(ranked);
      }
  }

  return results.sort((left, right) => right.score - left.score || left.person.handle.localeCompare(right.person.handle));
}

function addWeightedMatch(
  merged: Map<string, MergedSearchResult>,
  handle: string,
  score: number,
  weight: number,
  explanation: string | undefined,
  evidence: SearchEvidenceRef[]
) {
  if (score <= 0 || weight <= 0 || evidence.length === 0) {
    return;
  }

  const existing = merged.get(handle) ?? {
    score: 0,
    explanations: [],
    evidence: []
  };

  existing.score += score * weight;
  if (explanation) {
    existing.explanations.push(explanation);
  }
  existing.evidence.push(...evidence);
  merged.set(handle, existing);
}

function mergeExplanations(displayName: string, explanations: string[]): string {
  const unique = [...new Set(explanations.map((explanation) => explanation.trim()).filter(Boolean))];

  if (unique.length === 0) {
    return `${displayName} matched the query with evidence.`;
  }

  if (unique.length === 1) {
    return unique[0] ?? `${displayName} matched the query with evidence.`;
  }

  return `${unique[0]} Additional hybrid signals: ${unique.slice(1).join(" ")}`;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type MergedSearchResult = {
  score: number;
  explanations: string[];
  evidence: SearchProviderMatch["evidence"];
};

function matchedClaims(document: PersonSearchDocument, evidence: SearchEvidenceRef[]) {
  const ids = new Set(evidence.filter((item) => item.type === "claim").map((item) => item.id));
  const titles = new Set(evidence.filter((item) => item.type === "claim").map((item) => item.title));
  return document.claims?.filter((claim) => (claim.id && ids.has(claim.id)) || titles.has(claim.text)).slice(0, 5);
}

function matchedCards(document: PersonSearchDocument, evidence: SearchEvidenceRef[]) {
  const titles = new Set(evidence.filter((item) => item.type === "card").map((item) => item.title));
  return document.cards?.filter((card) => titles.has(card.title)).slice(0, 3);
}
