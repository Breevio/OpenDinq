import type { ParsedSearchQuery } from "./types.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "builder",
  "card",
  "cards",
  "developer",
  "engineer",
  "find",
  "for",
  "generate",
  "in",
  "look",
  "lookup",
  "manual",
  "notes",
  "on",
  "of",
  "about",
  "people",
  "person",
  "profile",
  "profiles",
  "public",
  "q",
  "return",
  "research",
  "search",
  "source",
  "sources",
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
    .map((term) => term.trim().replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

export function isNearTokenMatch(term: string, token: string): boolean {
  if (term.length < 6 || token.length < 6 || token[0] !== term[0]) {
    return false;
  }

  if (term === token) {
    return true;
  }
  if (Math.abs(term.length - token.length) > 1) {
    return false;
  }

  let termIndex = 0;
  let tokenIndex = 0;
  let edits = 0;
  while (termIndex < term.length && tokenIndex < token.length) {
    if (term[termIndex] === token[tokenIndex]) {
      termIndex += 1;
      tokenIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (term.length > token.length) {
      termIndex += 1;
    } else if (token.length > term.length) {
      tokenIndex += 1;
    } else {
      termIndex += 1;
      tokenIndex += 1;
    }
  }

  return edits + (termIndex < term.length ? 1 : 0) + (tokenIndex < token.length ? 1 : 0) <= 1;
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
