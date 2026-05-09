"use client";

import { useState } from "react";
import { apiRequest, type ProfileGenerationResponse, type ProfilePlanResponse } from "../lib/api";

const EXAMPLES = [
  "https://github.com/torvalds",
  "torvalds",
  "Generate a profile for Linus Torvalds",
  "AI product engineer who built an evidence-backed workflow",
  "https://example.com/about"
];

export function ProfileGenerateForm() {
  const [input, setInput] = useState("AI product engineer who built an evidence-backed workflow");
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
  const [mode, setMode] = useState<"plan" | "generate" | "advanced" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<ProfilePlanResponse | null>(null);
  const [result, setResult] = useState<ProfileGenerationResponse | null>(null);

  async function previewPlan() {
    setIsLoading(true);
    setMode("plan");
    setError(null);
    setResult(null);
    try {
      setPlanResult(await apiRequest<ProfilePlanResponse>("/api/profiles/plan", {
        method: "POST",
        body: JSON.stringify({ input })
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Profile planning failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function generateAi(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMode("generate");
    setError(null);
    setResult(null);
    try {
      const generated = await apiRequest<ProfileGenerationResponse>("/api/profiles/generate-ai", {
        method: "POST",
        body: JSON.stringify({ input, reviewPlan: false })
      });
      setResult(generated);
      if (generated.plan) {
        setPlanResult({ plan: generated.plan, llmUsed: Boolean(generated.llmUsed), warnings: generated.warnings });
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Profile generation failed.");
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
      setError(caughtError instanceof Error ? caughtError.message : "Profile generation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="ai-generate-panel">
      <form className="ai-generate-form" onSubmit={generateAi}>
        <div className="ai-prompt-shell">
          <textarea
            aria-label="Profile generation input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste a URL, GitHub handle, ORCID, arXiv id, website, or describe the person..."
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
            {isLoading && mode === "generate" ? "Generating" : "Generate profile"}
          </button>
          <button className="secondary-button" type="button" disabled={isLoading || !input.trim()} onClick={previewPlan}>
            {isLoading && mode === "plan" ? "Planning" : "Preview plan"}
          </button>
        </div>
      </form>

      {error ? <p className="status error">{error}</p> : null}
      {planResult ? <PlanPreview response={planResult} /> : null}
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

function PlanPreview({ response }: { response: ProfilePlanResponse }) {
  const { plan } = response;
  const manualOnly = plan.intent === "manual_profile" && !plan.sources.some((source) => source.evidenceStatus === "explicit");
  return (
    <div className="plan-preview">
      <div className="result-strip">
        <span>{response.llmUsed ? "LLM planned" : "Local fallback plan"}</span>
        <span>{manualOnly ? "Needs public source" : plan.intent}</span>
        <span>{Math.round(plan.confidence * 100)}% confidence</span>
      </div>
      {response.warnings.length ? <p className="status warning">{response.warnings.join(" ")}</p> : null}
      <div className="plan-grid">
        <div>
          <strong>Subject</strong>
          <span>{plan.subject.displayName ?? "Unknown"}</span>
          {plan.subject.handle ? <span>{plan.subject.handle}</span> : null}
          {plan.subject.headline ? <span>{plan.subject.headline}</span> : null}
        </div>
        <div>
          <strong>Public sources to import</strong>
          {plan.sources.length ? plan.sources.map((source) => (
            <span key={`${source.type}-${JSON.stringify(source.input)}`}>{source.evidenceStatus === "user_provided" ? "No public source supplied; using your input as a review seed." : `${source.type}: ${typeof source.input === "string" ? source.input : JSON.stringify(source.input)}`}</span>
          )) : <span>No reliable public source yet</span>}
        </div>
      </div>
      {plan.userProvidedClaims.length ? (
        <div className="plan-grid">
          <div>
            <strong>Review seed from your input</strong>
            {plan.userProvidedClaims.map((claim) => <span key={claim.text}>{claim.text}</span>)}
          </div>
          <div>
            <strong>Evidence to add next</strong>
            {plan.missingEvidence.map((item) => <span key={item.need}>{item.need}: {item.suggestedSource ?? item.reason}</span>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GenerationResult({ result, input }: { result: ProfileGenerationResponse; input: string }) {
  const needsReview = result.status === "needs_review";
  const manualOnly = result.plan?.intent === "manual_profile" && !result.plan.sources.some((source) => source.evidenceStatus === "explicit");
  return (
    <div className="completion-panel">
      <p className="eyebrow">{needsReview ? "Review workspace created" : "Generation completed"}</p>
      <div className="result-strip">
        <span>{needsReview ? "needs review" : result.status}</span>
        <span>{result.llmUsed ? (manualOnly ? "LLM planned review" : "LLM used") : "Local fallback plan"}</span>
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
