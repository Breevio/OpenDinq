import type { ParsedSearchQuery } from "./types.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "builder",
  "developer",
  "engineer",
  "for",
  "in",
  "of",
  "the",
  "using",
  "with"
]);

export function parseSearchQuery(queryText: string): ParsedSearchQuery {
  const normalizedQuery = queryText.trim().replace(/\s+/g, " ");

  if (!normalizedQuery) {
    throw new Error("Search query is required.");
  }

  const terms = tokenize(normalizedQuery).filter((term) => !STOP_WORDS.has(term));

  return {
    queryText: normalizedQuery,
    terms: [...new Set(terms)],
    phrases: extractPhrases(normalizedQuery)
  };
}

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function extractPhrases(queryText: string): string[] {
  const phrases = queryText.match(/"([^"]+)"/g) ?? [];
  return phrases.map((phrase) => phrase.replaceAll('"', "").toLowerCase()).filter(Boolean);
}

