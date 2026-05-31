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
            <button key={suggestion} type="button" onClick={() => setQuery(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <div className="result-list">
        {results.map((result) => (
          <article className="result-card" key={result.person.handle}>
            <div>
              <a className="result-title" href={result.profileUrl ?? `/u/${result.person.handle}`}>
                {result.person.displayName}
              </a>
              {result.person.headline ? <p>{result.person.headline}</p> : null}
              <p>{discoverResultSummary(result)}</p>
              {result.topSkills?.length ? (
                <div className="skill-strip compact">
                  {result.topSkills.slice(0, 6).map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              ) : null}
              {result.matchedClaims?.length ? (
                <div className="evidence-list">
                  {result.matchedClaims.slice(0, 3).map((claim) => (
                    <span key={claim.id ?? claim.text}>{claim.text}</span>
                  ))}
                </div>
              ) : null}
              {result.matchedCards?.length ? (
                <div className="matched-block">
                  <strong>Profile cards</strong>
                  {result.matchedCards.slice(0, 2).map((card) => (
                    <span key={card.id ?? card.title}>{card.title}</span>
                  ))}
                </div>
              ) : null}
              {result.matchedArtifacts?.length ? (
                <div className="matched-block">
                  <strong>Source artifacts</strong>
                  {result.matchedArtifacts.slice(0, 2).map((artifact) => (
                    artifact.url ? <a href={artifact.url} key={artifact.id ?? artifact.url}>{artifact.title}</a> : <span key={artifact.id ?? artifact.title}>{artifact.title}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <span className="score">{discoverMatchLabel(result.score)}</span>
            <EvidenceList evidence={result.evidence.slice(0, 3)} compact />
          </article>
        ))}
      </div>
    </section>
  );
}

function discoverResultSummary(result: SearchResult) {
  const parts: string[] = [];

  if (result.topSkills?.length) {
    parts.push(`Matched skills like ${result.topSkills.slice(0, 2).join(" and ")}.`);
  }

  if (result.matchedClaims?.length) {
    parts.push(`Found ${result.matchedClaims.length} supporting claim${result.matchedClaims.length === 1 ? "" : "s"}.`);
  }

  if (result.matchedArtifacts?.length) {
    parts.push(`Linked ${result.matchedArtifacts.length} public artifact${result.matchedArtifacts.length === 1 ? "" : "s"}.`);
  }

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return "Matched profile evidence already captured in OpenDinq.";
}

function discoverMatchLabel(score: number) {
  if (score >= 0.9) {
    return "Strong match";
  }
  if (score >= 0.7) {
    return "Good match";
  }
  return "Possible match";
}
