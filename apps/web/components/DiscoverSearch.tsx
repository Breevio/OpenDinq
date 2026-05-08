"use client";

import { useState } from "react";
import { apiRequest, type SearchResult } from "../lib/api";

export function DiscoverSearch() {
  const [query, setQuery] = useState("AI agent TypeScript MCP");
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

      <div className="result-list">
        {results.map((result) => (
          <article className="result-card" key={result.person.handle}>
            <div>
              <a className="result-title" href={`/u/${result.person.handle}`}>
                {result.person.displayName}
              </a>
              <p>{result.explanation}</p>
            </div>
            <span className="score">{Math.round(result.score * 100)}%</span>
            <div className="evidence-list">
              {result.evidence.slice(0, 3).map((evidence) => (
                <a href={evidence.url} key={`${result.person.handle}-${evidence.id}-${evidence.reason}`}>
                  {evidence.title}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

