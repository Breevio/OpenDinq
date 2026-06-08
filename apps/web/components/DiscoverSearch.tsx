"use client";

import { useEffect, useState } from "react";
import { apiRequest, type SearchResult } from "../lib/api";
import { EvidenceList } from "./EvidenceList";

export function DiscoverSearch() {
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q");
    if (initialQuery) {
      void runSearch(initialQuery);
    }
  }, []);

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearch(query);
  }

  async function searchSuggestion(suggestion: string) {
    setQuery(suggestion);
    await runSearch(suggestion);
  }

  async function runSearch(searchQuery: string) {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest<{ results: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(searchQuery)}`
      );
      setResults(response.results);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Search failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="tool-panel">
      <form className="command-form" onSubmit={submitSearch}>
        <label htmlFor="discover-query">Search profiles</label>
        <div className="command-row">
          <input
            id="discover-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by skill, role, claim, artifact, or topic"
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Searching" : "Search"}
          </button>
        </div>
      </form>

      {error ? <p className="status error">{error}</p> : null}
      {!isLoading && results.length === 0 ? (
        <div className="suggestion-list">
          {[
            "open-source infrastructure",
            "language model research",
            "developer tools",
            "systems engineering",
            "product design"
          ].map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void searchSuggestion(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <div className="result-list">
        {results.map((result) => {
          const claimSnippets = discoverClaimSnippets(result);

          return (
            <article className="result-card" key={result.person.handle}>
              <div>
                <div className="result-card-header">
                  <div>
                    <a className="result-title" href={result.profileUrl ?? `/u/${result.person.handle}`}>
                      {result.person.displayName}
                    </a>
                    {result.person.headline ? <p>{result.person.headline}</p> : null}
                  </div>
                  <span className="score">{discoverMatchLabel(result.score)}</span>
                </div>
                <p>{discoverResultSummary(result)}</p>
                {result.topSkills?.length ? (
                  <div className="skill-strip compact">
                    {result.topSkills.slice(0, 4).map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>
                ) : null}
                {claimSnippets.length ? (
                  <div className="evidence-list">
                    {claimSnippets.map((claim) => (
                      <span key={claim}>{claim}</span>
                    ))}
                  </div>
                ) : null}
                <EvidenceList evidence={result.evidence.slice(0, 2)} compact />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function discoverClaimSnippets(result: SearchResult) {
  const skillNames = new Set((result.topSkills ?? []).map((skill) => skill.toLowerCase()));
  return (result.matchedClaims ?? [])
    .map((claim) => claim.text)
    .filter((claimText) => !skillNames.has(claimText.toLowerCase()))
    .slice(0, 2);
}

function discoverResultSummary(result: SearchResult) {
  const parts: string[] = [];

  if (result.topSkills?.length) {
    parts.push(`Matches ${result.topSkills.slice(0, 2).join(" and ")}.`);
  }

  if (result.matchedClaims?.length) {
    parts.push(`${result.matchedClaims.length} evidence-backed claim${result.matchedClaims.length === 1 ? "" : "s"}.`);
  }

  if (result.matchedArtifacts?.length) {
    parts.push(`${result.matchedArtifacts.length} public source${result.matchedArtifacts.length === 1 ? "" : "s"}.`);
  }

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return "Matched profile evidence already captured in OpenDinq.";
}

function discoverMatchLabel(score: number) {
  if (score >= 0.9) {
    return "Best evidence";
  }
  if (score >= 0.7) {
    return "Relevant";
  }
  return "Review";
}
