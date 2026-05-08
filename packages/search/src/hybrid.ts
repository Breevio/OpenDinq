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

  return [...merged.entries()]
    .map(([handle, result]) => {
      const document = byHandle.get(handle);
      if (!document) {
        return undefined;
      }

      return {
        person: document.person,
        score: roundScore(Math.min(1, result.score)),
        explanation: mergeExplanations(document.person.displayName, result.explanations),
        evidence: dedupeEvidence(result.evidence)
      };
    })
    .filter((result): result is RankedSearchResult => Boolean(result && result.score > 0 && result.evidence.length > 0))
    .sort((left, right) => right.score - left.score || left.person.handle.localeCompare(right.person.handle));
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
