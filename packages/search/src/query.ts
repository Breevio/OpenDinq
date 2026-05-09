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
    phrases: extractPhrases(normalizedQuery),
    intent: parseIntent(terms)
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

function parseIntent(terms: string[]): ParsedSearchQuery["intent"] {
  const termSet = new Set(terms);
  return {
    skills: terms.filter((term) => SKILL_TERMS.has(term)),
    projectTerms: terms.filter((term) => PROJECT_TERMS.has(term)),
    researchTerms: terms.filter((term) => RESEARCH_TERMS.has(term)),
    sourceHints: terms.filter((term) => SOURCE_HINTS.has(term)),
    roleTerms: terms.filter((term) => ROLE_TERMS.has(term) || termSet.has("senior") && term === "senior")
  };
}

const SKILL_TERMS = new Set(["typescript", "python", "rust", "mcp", "react", "next.js", "llm", "rag", "design", "evaluation"]);
const PROJECT_TERMS = new Set(["project", "projects", "builder", "builders", "maintainer", "maintainers", "startup", "onboarding"]);
const RESEARCH_TERMS = new Set(["research", "researcher", "paper", "papers", "arxiv", "evaluation", "benchmark", "model", "language"]);
const SOURCE_HINTS = new Set(["github", "arxiv", "openalex", "orcid", "website"]);
const ROLE_TERMS = new Set(["engineer", "designer", "researcher", "maintainer", "founder", "senior"]);
