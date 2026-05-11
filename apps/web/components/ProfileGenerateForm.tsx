"use client";

import { useState } from "react";
import { apiRequest, type ProfileCandidate, type ProfileGenerationResponse, type ProfileResolutionResponse, type SearchAndGenerateResponse } from "../lib/api";

const EXAMPLES = [
  "Jiajun Wu",
  "Linus Torvalds",
  "AI agent builders working on MCP",
  "Stanford researcher working on 3D scene understanding",
  "https://github.com/torvalds",
];

export function ProfileGenerateForm() {
  const [input, setInput] = useState("Jiajun Wu");
  const [displayName, setDisplayName] = useState("Ada Builder");
  const [handle, setHandle] = useState("ada-builder");
  const [headline, setHeadline] = useState("AI product engineer");
  const [github, setGithub] = useState("");
  const [website, setWebsite] = useState("");
  const [openAlex, setOpenAlex] = useState("");
  const [arxiv, setArxiv] = useState("");
  const [orcid, setOrcid] = useState("");
  const [manualTitle, setManualTitle] = useState("Built an agent workflow");
  const [manualUrl, setManualUrl] = useState("https://example.com/agent-workflow");
  const [manualNote, setManualNote] = useState("Designed and shipped an evidence-backed AI workflow for profile generation.");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"resolve" | "generate" | "advanced" | "candidate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ProfileResolutionResponse | null>(null);
  const [result, setResult] = useState<ProfileGenerationResponse | null>(null);

  async function previewCandidates() {
    setIsLoading(true);
    setMode("resolve");
    setError(null);
    setResult(null);
    try {
      setResolution(await apiRequest<ProfileResolutionResponse>("/api/profiles/resolve", {
        method: "POST",
        body: JSON.stringify({ input })
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Candidate search needs review.");
    } finally {
      setIsLoading(false);
    }
  }

  async function searchAndGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMode("generate");
    setError(null);
    setResult(null);
    try {
      const generated = await apiRequest<SearchAndGenerateResponse>("/api/profiles/search-and-generate", {
        method: "POST",
        body: JSON.stringify({ input, autoSelect: true })
      });
      if (generated.needsSelection || generated.candidates) {
        setResolution({
          rawInput: generated.rawInput ?? input,
          queryType: generated.queryType ?? "unknown",
          candidates: generated.candidates ?? [],
          autoSelectedCandidateId: generated.autoSelectedCandidateId,
          needsSelection: Boolean(generated.needsSelection),
          warnings: generated.warnings ?? []
        });
      } else {
        setResult(generated);
        setResolution(generated.resolution ?? null);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Some sources could not be imported.");
    } finally {
      setIsLoading(false);
    }
  }

  async function generateCandidate(candidate: ProfileCandidate) {
    setIsLoading(true);
    setMode("candidate");
    setError(null);
    try {
      setResult(await apiRequest<ProfileGenerationResponse>("/api/profiles/generate-from-candidate", {
        method: "POST",
        body: JSON.stringify({ candidateId: candidate.id, rawInput: input, candidate })
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Some sources could not be imported.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitAdvanced(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMode("advanced");
    setError(null);
    setResult(null);

    const sources = [
      github ? { type: "github", input: github } : undefined,
      website ? { type: "website", input: website } : undefined,
      openAlex ? { type: "openalex", input: openAlex } : undefined,
      arxiv ? { type: "arxiv", input: arxiv } : undefined,
      orcid ? { type: "orcid", input: orcid } : undefined,
      manualTitle || manualUrl || manualNote
        ? {
            type: "manual",
            input: {
              title: manualTitle || undefined,
              url: manualUrl || undefined,
              note: manualNote || undefined
            }
          }
        : undefined
    ].filter(Boolean);

    try {
      setResult(await apiRequest<ProfileGenerationResponse>("/api/profiles/generate", {
        method: "POST",
        body: JSON.stringify({ displayName, handle, headline, sources })
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Some sources could not be imported.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="ai-generate-panel">
      <form className="ai-generate-form" onSubmit={searchAndGenerate}>
        <div className="ai-prompt-shell">
          <textarea
            aria-label="Profile generation input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search a person, describe them, or paste a source..."
          />
          <div className="example-chips" aria-label="Examples">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setInput(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
        <div className="actions">
          <button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading && mode === "generate" ? "Searching" : "Search & generate"}
          </button>
          <button className="secondary-button" type="button" disabled={isLoading || !input.trim()} onClick={previewCandidates}>
            {isLoading && mode === "resolve" ? "Searching" : "Preview candidates"}
          </button>
        </div>
      </form>

      {error ? <p className="status warning">{error}</p> : null}
      {resolution ? <CandidateResolution response={resolution} onGenerate={generateCandidate} disabled={isLoading} /> : null}
      {result ? <GenerationResult result={result} input={input} /> : null}

      <details className="advanced-sources">
        <summary>Advanced sources</summary>
        <form className="generator-form" onSubmit={submitAdvanced}>
          <div className="field-grid">
            <label>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label>
              Handle
              <input value={handle} onChange={(event) => setHandle(event.target.value)} />
            </label>
            <label className="span-2">
              Headline
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
            </label>
          </div>

          <div className="field-grid">
            <label>
              GitHub
              <input value={github} onChange={(event) => setGithub(event.target.value)} placeholder="username or URL" />
            </label>
            <label>
              Website
              <input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
            </label>
            <label>
              OpenAlex
              <input value={openAlex} onChange={(event) => setOpenAlex(event.target.value)} placeholder="A123456789" />
            </label>
            <label>
              arXiv
              <input value={arxiv} onChange={(event) => setArxiv(event.target.value)} placeholder="2601.01234" />
            </label>
            <label>
              ORCID
              <input value={orcid} onChange={(event) => setOrcid(event.target.value)} placeholder="0000-0002-1825-0097" />
            </label>
          </div>

          <div className="field-grid">
            <label>
              Manual link title
              <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} />
            </label>
            <label>
              Manual link URL
              <input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} />
            </label>
            <label className="span-2">
              Manual note
              <textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} />
            </label>
          </div>

          <button type="submit" disabled={isLoading}>
            {isLoading && mode === "advanced" ? "Generating" : "Generate from advanced sources"}
          </button>
        </form>
      </details>
    </section>
  );
}

function CandidateResolution({ response, onGenerate, disabled }: { response: ProfileResolutionResponse; onGenerate: (candidate: ProfileCandidate) => void; disabled: boolean }) {
  return (
    <div className="plan-preview">
      <div className="result-strip">
        <span>{response.queryType}</span>
        <span>{response.needsSelection ? "Candidate requires confirmation" : response.autoSelectedCandidateId ? "Auto-selected candidate" : "No public candidate yet"}</span>
        <span>{response.candidates.length} people</span>
      </div>
      {response.warnings.length ? <p className="status warning">{response.warnings.join(" ")}</p> : null}
      {response.candidates.length ? (
        <div className="candidate-grid">
          {response.candidates.map((candidate) => (
            <article className="candidate-card" key={candidate.id}>
              <div className="candidate-card-header">
                <div>
                  <strong>{candidate.displayName}</strong>
                  {candidate.headline ? <span>{candidate.headline}</span> : null}
                  {candidate.sourceUrl ? <span>{candidate.sourceUrl}</span> : null}
                </div>
                <span>{Math.round(candidate.confidence * 100)}%</span>
              </div>
              <div className="result-strip">
                {candidateSources(candidate).map((source) => (
                  <span key={`${candidate.id}-${source}`}>{source}</span>
                ))}
                {candidate.handle ? <span>{candidate.handle}</span> : null}
              </div>
              {candidate.evidencePreview.length ? (
                <div className="candidate-evidence">
                  {candidate.evidencePreview.slice(0, 3).map((item) => <span key={`${candidate.id}-${item.id}`}>{item.title}</span>)}
                </div>
              ) : null}
              {candidate.reasons.length ? <p>{candidate.reasons.join(" ")}</p> : null}
              {candidate.warnings.length ? <p className="status warning">{candidate.warnings.join(" ")}</p> : null}
              <button type="button" disabled={disabled} onClick={() => onGenerate(candidate)}>
                Generate this profile
              </button>
            </article>
          ))}
        </div>
      ) : <p className="status warning">No public candidate found yet. OpenDinq can still create a review workspace from your description.</p>}
    </div>
  );
}

function candidateSources(candidate: ProfileCandidate): string[] {
  return [...new Set((candidate.sources?.map((source) => source.sourceType) ?? [candidate.sourceType]))];
}

function GenerationResult({ result, input }: { result: ProfileGenerationResponse; input: string }) {
  const needsReview = result.status === "needs_review";
  const manualOnly = result.plan?.intent === "manual_profile" && !result.plan.sources.some((source) => source.evidenceStatus === "explicit");
  return (
    <div className="completion-panel">
      <p className="eyebrow">{needsReview ? "Review workspace created" : "Generation completed"}</p>
      <div className="result-strip">
        <span>{needsReview ? "needs review" : result.status}</span>
        <span>{result.llmUsed ? (manualOnly ? "LLM planned review" : "LLM used") : "Using local candidate search"}</span>
        <span>{result.artifactsImported} artifacts</span>
        <span>{result.claimsGenerated} claims</span>
        <span>{result.cardsGenerated} cards</span>
      </div>
      {result.warnings.length ? <p className="status warning">{result.warnings.join(" ")}</p> : null}
      <div className="actions">
        <a href={result.workspaceUrl ?? `/u/${result.handle}/workspace`}>Open workspace</a>
        <a href={result.profileUrl}>View public profile</a>
        <a href={`/discover?q=${encodeURIComponent(input)}`}>Search in Discover</a>
      </div>
    </div>
  );
}
