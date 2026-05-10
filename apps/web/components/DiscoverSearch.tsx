"use client";

import { useState } from "react";
import { apiRequest, type SearchResult } from "../lib/api";
import { EvidenceList } from "./EvidenceList";

export function DiscoverSearch() {
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") {
      return "AI agent TypeScript MCP";
    }
    return new URLSearchParams(window.location.search).get("q") ?? "AI agent TypeScript MCP";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest<{ results: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(query)}`
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
        <label htmlFor="discover-query">Natural-language people search</label>
        <div className="command-row">
          <input
            id="discover-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="AI agent developers using TypeScript and MCP"
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
            "AI agent builders with TypeScript and MCP",
            "researchers working on language models",
            "open-source infrastructure engineers",
            "people with strong evidence in product design",
            "profiles with manual notes about startups"
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
              <p>{result.explanation}</p>
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
                  <strong>Matched cards</strong>
                  {result.matchedCards.slice(0, 2).map((card) => (
                    <span key={card.id ?? card.title}>{card.title}</span>
                  ))}
                </div>
              ) : null}
              {result.matchedArtifacts?.length ? (
                <div className="matched-block">
                  <strong>Matched artifacts</strong>
                  {result.matchedArtifacts.slice(0, 2).map((artifact) => (
                    artifact.url ? <a href={artifact.url} key={artifact.id ?? artifact.url}>{artifact.title}</a> : <span key={artifact.id ?? artifact.title}>{artifact.title}</span>
                  ))}
                </div>
              ) : null}
              <div className="matched-block compact-breakdown" aria-label="Score breakdown">
                <strong>Why matched</strong>
                <span>claims {Math.round(result.scoreBreakdown.claimScore * 100)}%</span>
                <span>cards {Math.round(result.scoreBreakdown.cardScore * 100)}%</span>
                <span>artifacts {Math.round(result.scoreBreakdown.artifactScore * 100)}%</span>
                <span>evidence {Math.round(result.scoreBreakdown.evidenceScore * 100)}%</span>
              </div>
            </div>
            <span className="score">{Math.round(result.score * 100)}%</span>
            <EvidenceList evidence={result.evidence.slice(0, 3)} compact />
          </article>
        ))}
      </div>
    </section>
  );
}
