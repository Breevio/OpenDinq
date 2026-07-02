"use client";

import { useEffect, useState } from "react";
import { apiRequest, type SearchResult } from "../lib/api";
import { EvidenceList } from "./EvidenceList";

type SearchFacet = {
  field: "skill" | "location" | "sourceType";
  label: string;
  values: Array<{ value: string; count: number }>;
};

type SearchResponse = {
  results: SearchResult[];
  facets?: SearchFacet[];
  filters?: Record<string, unknown>;
};

type ActiveFilters = {
  skills: string[];
  locations: string[];
  sourceTypes: string[];
};

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
  const [facets, setFacets] = useState<SearchFacet[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    skills: [],
    locations: [],
    sourceTypes: []
  });
  const [showFilters, setShowFilters] = useState(false);

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

  function toggleFilter(field: keyof ActiveFilters, value: string) {
    setActiveFilters((current) => {
      const list = current[field];
      const next = list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value];
      const updated = { ...current, [field]: next };
      void runSearch(query, updated);
      return updated;
    });
  }

  function clearFilters() {
    const cleared: ActiveFilters = { skills: [], locations: [], sourceTypes: [] };
    setActiveFilters(cleared);
    void runSearch(query, cleared);
  }

  function buildFilterParams(filters: ActiveFilters): string {
    const params: string[] = [];
    if (filters.skills.length) {
      params.push(`skills=${encodeURIComponent(filters.skills.join(","))}`);
    }
    if (filters.locations.length) {
      params.push(`locations=${encodeURIComponent(filters.locations.join(","))}`);
    }
    if (filters.sourceTypes.length) {
      params.push(`sourceTypes=${encodeURIComponent(filters.sourceTypes.join(","))}`);
    }
    return params.length ? `&${params.join("&")}` : "";
  }

  async function runSearch(searchQuery: string, filters: ActiveFilters = activeFilters) {
    setIsLoading(true);
    setError(null);

    try {
      const filterParams = buildFilterParams(filters);
      const response = await apiRequest<SearchResponse>(
        `/api/search?q=${encodeURIComponent(searchQuery)}${filterParams}`
      );
      setResults(response.results);
      setFacets(response.facets ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Search failed.");
    } finally {
      setIsLoading(false);
    }
  }

  const activeFilterCount =
    activeFilters.skills.length +
    activeFilters.locations.length +
    activeFilters.sourceTypes.length;

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

      {facets.length > 0 ? (
        <div className="filter-bar">
          <button
            type="button"
            className={`filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
          </button>
          {activeFilterCount > 0 ? (
            <button type="button" className="filter-clear" onClick={clearFilters}>
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      {showFilters && facets.length > 0 ? (
        <div className="filter-panel">
          {facets.map((facet) => (
            <div key={facet.field} className="filter-group">
              <h4>{facet.label}</h4>
              {facet.values.map((value) => {
                const filterKey = filterFieldKey(facet.field);
                const isActive = activeFilters[filterKey].includes(value.value);
                return (
                  <button
                    key={value.value}
                    type="button"
                    className={`filter-chip ${isActive ? "active" : ""}`}
                    onClick={() => toggleFilter(filterKey, value.value)}
                  >
                    {value.value} <span className="filter-count">{value.count}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="status error">{error}</p> : null}
      {!isLoading && results.length === 0 && !activeFilterCount ? (
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
      {!isLoading && results.length === 0 && activeFilterCount > 0 ? (
        <p className="status">No results match these filters. Try clearing some filters.</p>
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

function filterFieldKey(field: SearchFacet["field"]): keyof ActiveFilters {
  switch (field) {
    case "skill":
      return "skills";
    case "location":
      return "locations";
    case "sourceType":
      return "sourceTypes";
  }
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

