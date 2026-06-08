"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  GitBranch,
  Globe2,
  IdCard,
  Link2,
  Loader2,
  Search,
  Sparkles,
  User,
  Users
} from "lucide-react";
import { apiRequest, type ProfileCandidate, type ProfileGenerationResponse, type ProfileResolutionResponse, type SearchAndGenerateResponse } from "../lib/api";
import { GitHubRecoveryPanel } from "./GitHubRecoveryPanel";

type RetryAction =
  | { kind: "search" }
  | { kind: "candidate"; candidate: ProfileCandidate }
  | { kind: "advanced" };

export function ProfileGenerateForm({ initialQuery = "" }: { initialQuery?: string }) {
  const [input, setInput] = useState(() => initialQuery);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [headline, setHeadline] = useState("");
  const [github, setGithub] = useState("");
  const [website, setWebsite] = useState("");
  const [openAlex, setOpenAlex] = useState("");
  const [arxiv, setArxiv] = useState("");
  const [orcid, setOrcid] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"resolve" | "generate" | "advanced" | "candidate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ProfileResolutionResponse | null>(null);
  const [result, setResult] = useState<ProfileGenerationResponse | null>(null);
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const autoRunQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const queryFromUrl = initialQuery.trim();
    if (!queryFromUrl) {
      return;
    }
    setInput((currentInput) => (currentInput === queryFromUrl ? currentInput : queryFromUrl));
    if (autoRunQueryRef.current === queryFromUrl) {
      return;
    }
    autoRunQueryRef.current = queryFromUrl;
    void runSearchAndGenerate(queryFromUrl);
  }, [initialQuery]);

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

  async function runSearchAndGenerate(searchInput = input) {
    const normalizedInput = searchInput.trim();
    if (!normalizedInput) {
      return;
    }
    setIsLoading(true);
    setMode("generate");
    setError(null);
    setResult(null);
    setRetryAction({ kind: "search" });
    try {
      const generated = await apiRequest<SearchAndGenerateResponse>("/api/profiles/agent-search", {
        method: "POST",
        body: JSON.stringify({ input: normalizedInput })
      });
      const candidates = generated.candidates ?? [];
      if (generated.handle) {
        setResult(generated);
        setResolution(generated.needsSelection ? {
          rawInput: generated.rawInput ?? normalizedInput,
          queryType: generated.queryType ?? "unknown",
          candidates,
          autoSelectedCandidateId: generated.autoSelectedCandidateId,
          needsSelection: Boolean(generated.needsSelection),
          warnings: [...new Set([...(generated.warnings ?? []), ...(generated.agentWarnings ?? [])])]
        } : null);
      } else if (generated.needsSelection || candidates.length > 0) {
        setResolution({
          rawInput: generated.rawInput ?? normalizedInput,
          queryType: generated.queryType ?? "unknown",
          candidates,
          autoSelectedCandidateId: generated.autoSelectedCandidateId,
          needsSelection: Boolean(generated.needsSelection),
          warnings: [...new Set([...(generated.warnings ?? []), ...(generated.agentWarnings ?? [])])]
        });
      } else if (!generated.handle) {
        setError([...new Set([...(generated.warnings ?? []), ...(generated.agentWarnings ?? [])])].join(" ") || "No public candidate matched this input. Try a person name, handle, or public source URL.");
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

  async function searchAndGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearchAndGenerate(input);
  }

  async function runGenerateCandidate(candidate: ProfileCandidate) {
    setIsLoading(true);
    setMode("candidate");
    setError(null);
    setRetryAction({ kind: "candidate", candidate });
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

  async function generateCandidate(candidate: ProfileCandidate) {
    await runGenerateCandidate(candidate);
  }

  async function runAdvancedGenerate() {
    setIsLoading(true);
    setMode("advanced");
    setError(null);
    setResult(null);
    setRetryAction({ kind: "advanced" });

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

  async function submitAdvanced(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAdvancedGenerate();
  }

  async function retryLatestAction() {
    if (!retryAction || isLoading) {
      return;
    }
    if (retryAction.kind === "search") {
      await runSearchAndGenerate();
      return;
    }
    if (retryAction.kind === "candidate") {
      await runGenerateCandidate(retryAction.candidate);
      return;
    }
    await runAdvancedGenerate();
  }

  return (
    <section className="ai-generate-panel">
      <div className="generate-workbench">
        <form className="ai-generate-form" onSubmit={searchAndGenerate}>
          <div className="ai-prompt-shell">
            <textarea
              aria-label="Profile generation input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="GitHub URL, handle, or name"
            />
            <button className="primary-action" type="submit" disabled={isLoading || !input.trim()}>
              <Icon name={isLoading && mode === "generate" ? "loader" : "search"} />
              <span>{isLoading && mode === "generate" ? "Searching" : "Search"}</span>
            </button>
          </div>
          <div className="generate-form-footer">
            <div className="generate-workflow" aria-label="Generation workflow">
              <span><Icon name="link" />Source</span>
              <Icon name="arrow" />
              <span><Icon name="users" />Match</span>
              <Icon name="arrow" />
              <span><Icon name="card" />Cards</span>
            </div>
            <button className="secondary-button secondary-action" type="button" disabled={isLoading || !input.trim()} onClick={previewCandidates}>
              <Icon name="users" />
              {isLoading && mode === "resolve" ? "Searching" : "Preview"}
            </button>
          </div>
        </form>
      </div>

      {error ? <p className="status warning">{error}</p> : null}
      {resolution ? <CandidateResolution response={resolution} onGenerate={generateCandidate} disabled={isLoading} generatingId={isLoading && retryAction?.kind === "candidate" ? retryAction.candidate.id : undefined} /> : null}
      {result ? <GenerationResult result={result} input={input} onRetry={() => { void retryLatestAction(); }} /> : null}

      <details className="advanced-sources">
        <summary>Advanced sources</summary>
        <form className="generator-form" onSubmit={submitAdvanced}>
          <div className="field-grid">
            <label>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Name to show on the profile" />
            </label>
            <label>
              Handle
              <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="profile-handle" />
            </label>
            <label className="span-2">
              Headline
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Short role or summary" />
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
              <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Source title" />
            </label>
            <label>
              Manual link URL
              <input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="https://example.com/source" />
            </label>
            <label className="span-2">
              Manual note
              <textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} placeholder="Notes about why this source matters" />
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

function CandidateResolution({ response, onGenerate, disabled, generatingId }: { response: ProfileResolutionResponse; onGenerate: (candidate: ProfileCandidate) => void; disabled: boolean; generatingId?: string }) {
  const summary = response.needsSelection
    ? `Review ${response.candidates.length} match${response.candidates.length === 1 ? "" : "es"}`
    : response.autoSelectedCandidateId
      ? "We found a likely public match"
      : "No clear public match yet";
  const visibleWarnings = response.warnings.filter((warning) => {
    if (!response.needsSelection) {
      return true;
    }
    return !/multiple possible matches\. select one before generation\./i.test(warning);
  });

  return (
    <div className="plan-preview">
      <div className="result-strip">
        <span><Icon name="users" /> {summary}</span>
      </div>
      {visibleWarnings.map((warning) => <p className="status warning" key={warning}>{warning}</p>)}
      {response.candidates.length ? (
        <div className="candidate-grid">
          {visibleCandidates(response.candidates).map((candidate) => (
            <article className={`candidate-card ${candidateTrustLevel(candidate)}`} key={candidate.id}>
              <div className="candidate-meta-row">
                <span className="candidate-ribbon"><Icon name={candidate.confidence >= 0.86 ? "check" : "alert"} /> {candidateDecisionLabel(candidate)}</span>
                <span><Icon name="link" /> {candidateEvidenceLabel(candidate)}</span>
              </div>
              <div className="candidate-card-header">
                <span className="source-icon" aria-hidden="true"><Icon name={candidateIconName(candidate)} /></span>
                <div>
                  <strong>{candidate.displayName}</strong>
                  {candidateSubtitle(candidate) ? <span>{candidateSubtitle(candidate)}</span> : null}
                  {candidate.sourceUrl ? <span>{candidate.sourceUrl}</span> : null}
                </div>
              </div>
              <div className="candidate-verdict">
                <strong>{candidateVerdict(candidate)}</strong>
                <span>{candidateDecisionReason(candidate)}</span>
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
              {visibleCandidateWarnings(candidate).map((warning) => <p className="status warning" key={`${candidate.id}-${warning}`}>{warning}</p>)}
              <button type="button" disabled={disabled} onClick={() => onGenerate(candidate)}>
                <Icon name={generatingId === candidate.id ? "loader" : "arrow"} />
                {generatingId === candidate.id ? "Generating" : candidate.confidence >= 0.86 ? "Use recommended source" : "Review this source"}
              </button>
            </article>
          ))}
        </div>
      ) : <p className="status warning">No public candidate found yet. OpenDinq can still create a review workspace from your description.</p>}
    </div>
  );
}

function visibleCandidates(candidates: ProfileCandidate[]): ProfileCandidate[] {
  return candidates.filter((candidate) => {
    if (isRepresentedByStrongerCandidate(candidate, candidates)) {
      return false;
    }
    if (candidate.sourceType !== "existing_profile") {
      return true;
    }
    return !candidates.some((other) =>
      other.id !== candidate.id
      && other.sourceType !== "existing_profile"
      && (
        (candidate.handle && other.handle === candidate.handle)
        || normalizeCandidateName(other.displayName) === normalizeCandidateName(candidate.displayName)
      )
    );
  });
}

function isRepresentedByStrongerCandidate(candidate: ProfileCandidate, candidates: ProfileCandidate[]): boolean {
  const candidateSourceCount = candidate.sources?.length ?? 1;
  if (candidateSourceCount > 1) {
    return false;
  }

  return candidates.some((other) =>
    other.id !== candidate.id
    && (other.sources?.length ?? 1) > candidateSourceCount
    && candidateIdentityMatches(other, candidate)
  );
}

function candidateIdentityMatches(left: ProfileCandidate, right: ProfileCandidate): boolean {
  const leftKeys = candidateIdentityKeys(left);
  const rightKeys = candidateIdentityKeys(right);
  return [...leftKeys].some((key) => rightKeys.has(key));
}

function candidateIdentityKeys(candidate: ProfileCandidate): Set<string> {
  const keys = new Set<string>();
  addCandidateIdentity(keys, candidate.sourceType, candidate.sourceId, candidate.sourceUrl, candidate.handle);
  for (const source of candidate.sources ?? []) {
    addCandidateIdentity(keys, source.sourceType, source.sourceId, source.sourceUrl);
  }
  return keys;
}

function addCandidateIdentity(
  keys: Set<string>,
  sourceType: ProfileCandidate["sourceType"],
  sourceId?: string,
  sourceUrl?: string,
  handle?: string
): void {
  if (sourceId) {
    keys.add(`${sourceType}:id:${sourceId.toLowerCase()}`);
  }
  if (sourceUrl) {
    keys.add(`${sourceType}:url:${sourceUrl.toLowerCase()}`);
  }
  if (sourceType === "github" && handle) {
    keys.add(`github:id:${handle.toLowerCase()}`);
    keys.add(`github:url:https://github.com/${handle.toLowerCase()}`);
  }
}

function normalizeCandidateName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isPublicBiography(candidate: ProfileCandidate): boolean {
  return candidate.sourceType === "website" && candidate.kind === "biography";
}

function candidateSources(candidate: ProfileCandidate): string[] {
  if (isPublicBiography(candidate)) {
    return ["Public biography"];
  }
  const sourceTypes = [...new Set((candidate.sources?.map((source) => source.sourceType) ?? [candidate.sourceType]))];
  const publicSourceTypes = sourceTypes.filter((sourceType) => sourceType !== "existing_profile" && sourceType !== "manual");
  const visibleSourceTypes = publicSourceTypes.length > 0 ? publicSourceTypes : sourceTypes;
  return visibleSourceTypes.map(formatSourceLabel);
}

function candidateSubtitle(candidate: ProfileCandidate): string | undefined {
  if (candidate.sourceType === "github") {
    return "GitHub profile";
  }
  if (candidate.sourceType === "openalex") {
    return "OpenAlex author record";
  }
  if (candidate.sourceType === "orcid") {
    return "ORCID record";
  }
  if (candidate.sourceType === "arxiv") {
    return "arXiv reference";
  }
  if (candidate.sourceType === "website") {
    if (candidate.headline && isPublicBiography(candidate)) {
      return candidate.headline;
    }
    return "Public website";
  }
  if (candidate.sourceType === "existing_profile") {
    return "Existing OpenDinq profile";
  }
  if (candidate.headline && !/\bworks\b|\bcitations\b|h-index|github user search result/i.test(candidate.headline)) {
    return candidate.headline;
  }
  return undefined;
}

function candidateIconName(candidate: ProfileCandidate): IconName {
  switch (candidate.sourceType) {
    case "github":
      return "github";
    case "openalex":
    case "orcid":
    case "arxiv":
      return "book";
    case "website":
    case "web":
      return "globe";
    case "existing_profile":
      return "user";
    default:
      return "link";
  }
}

function formatSourceLabel(sourceType: ProfileCandidate["sourceType"]): string {
  switch (sourceType) {
    case "github":
      return "GitHub";
    case "openalex":
      return "OpenAlex";
    case "orcid":
      return "ORCID";
    case "arxiv":
      return "arXiv";
    case "website":
      return "Website";
    case "existing_profile":
      return "Existing profile";
    case "manual":
      return "Manual note";
    case "web":
      return "Web result";
    default:
      return sourceType;
  }
}

function candidateEvidenceCount(candidate: ProfileCandidate): number {
  return candidate.sources?.reduce((count, source) => count + source.evidencePreview.length, candidate.evidencePreview.length) ?? candidate.evidencePreview.length;
}

function candidateTrustLevel(candidate: ProfileCandidate): string {
  if (candidate.confidence >= 0.86) {
    return "candidate-strong";
  }
  return candidateEvidenceCount(candidate) > 0 ? "candidate-review" : "candidate-weak";
}

function candidateDecisionLabel(candidate: ProfileCandidate): string {
  if (candidate.confidence >= 0.86) {
    return "Recommended";
  }
  if (candidate.confidence >= 0.72) {
    return "Needs confirmation";
  }
  return "Use with caution";
}

function candidateVerdict(candidate: ProfileCandidate): string {
  if (candidate.sourceType === "existing_profile") {
    return "Existing profile in OpenDinq";
  }
  if (candidate.confidence >= 0.86) {
    return "Best current source";
  }
  if (candidateEvidenceCount(candidate) > 0) {
    return "Compare before generating";
  }
  return "Needs clearer evidence";
}

function candidateDecisionReason(candidate: ProfileCandidate): string {
  if (candidate.confidence >= 0.86) {
    return "Best match.";
  }
  if (candidate.confidence >= 0.72) {
    return "Check identity.";
  }
  return "Low confidence.";
}

function candidateEvidenceLabel(candidate: ProfileCandidate): string {
  const count = candidateEvidenceCount(candidate);
  return `${count} source${count === 1 ? "" : "s"}`;
}

function visibleCandidateWarnings(candidate: ProfileCandidate): string[] {
  return candidate.warnings.map((warning) => {
    if (/name match may still be ambiguous/i.test(warning)) {
      return "This name may refer to more than one person. Review the source before generating.";
    }
    if (/github result may not match the requested person/i.test(warning)) {
      return "Review this GitHub profile before generating.";
    }
    if (/confirm orcid identity before generation/i.test(warning)) {
      return "Review this ORCID record before generating.";
    }
    if (/academic record match needs confirmation/i.test(warning)) {
      return "Academic records can share the same name. Use this only if the record is clearly the right person.";
    }
    if (/arxiv identifies papers, not people/i.test(warning)) {
      return "Review this paper reference before generating.";
    }
    if (/public web biographies can still describe the wrong person/i.test(warning)) {
      return "Review this public biography before generating.";
    }
    return warning;
  });
}

function GenerationResult({ result, input, onRetry }: { result: SearchAndGenerateResponse; input: string; onRetry?: () => void }) {
  const needsReview = result.status === "needs_review";
  const manualOnly = result.plan?.intent === "manual_profile" && !result.plan.sources.some((source) => source.evidenceStatus === "explicit");
  const generationSummary = result.agentUsed
    ? "OpenDinq searched multiple public sources"
    : result.llmUsed
      ? (manualOnly ? "OpenDinq created a review workspace from your description" : "OpenDinq matched a public source and built the profile")
      : "OpenDinq used direct source matching";
  return (
    <div className="completion-panel">
      <div className="completion-header">
        <span className="completion-icon" aria-hidden="true"><Icon name={needsReview ? "alert" : "check"} /></span>
        <div>
          <p className="eyebrow">{needsReview ? "Review workspace created" : "Generation completed"}</p>
          <strong>{generationSummary}</strong>
        </div>
      </div>
      <div className="metric-strip">
        <span><Icon name={needsReview ? "alert" : "check"} /> {needsReview ? "Needs review" : "Ready"}</span>
        <span><Icon name="link" /> {result.artifactsImported} source{result.artifactsImported === 1 ? "" : "s"}</span>
        <span><Icon name="card" /> {result.cardsGenerated} card{result.cardsGenerated === 1 ? "" : "s"}</span>
      </div>
      {result.warnings.length ? <p className="status warning">{result.warnings.join(" ")}</p> : null}
      {result.recoveryAdvice ? (
        <GitHubRecoveryPanel advice={result.recoveryAdvice} onRetry={onRetry} retryLabel="Retry generation" />
      ) : null}
      {result.researchSteps?.length ? (
        <div className="research-steps" aria-label="How OpenDinq found this profile">
          {result.researchSteps.map((step, index) => (
            <article className={step.status === "warning" ? "research-step warning-step" : "research-step"} key={`${step.tool}-${index}`}>
              <div>
                <strong>{step.title}</strong>
              </div>
              <p>{step.summary}</p>
              {step.evidence.length ? (
                <div className="candidate-evidence">
                  {step.evidence.slice(0, 3).map((item) => <span key={`${step.tool}-${item.id}`}>{item.title}</span>)}
                </div>
              ) : null}
              {step.warnings.length ? <p className="status warning">{step.warnings.join(" ")}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
      <div className="actions">
        <a href={result.workspaceUrl ?? `/u/${result.handle}/workspace`}><Icon name="arrow" /> Open workspace</a>
        <a href={result.profileUrl}><Icon name="user" /> View profile</a>
        <a href={`/discover?q=${encodeURIComponent(input)}`}><Icon name="search" /> Related</a>
      </div>
    </div>
  );
}

type IconName = "alert" | "arrow" | "book" | "card" | "check" | "github" | "globe" | "link" | "loader" | "search" | "spark" | "user" | "users";

function Icon({ name }: { name: IconName }) {
  const icons: Record<IconName, typeof Search> = {
    alert: AlertTriangle,
    arrow: ArrowRight,
    book: BookOpen,
    card: IdCard,
    check: Check,
    github: GitBranch,
    globe: Globe2,
    link: Link2,
    loader: Loader2,
    search: Search,
    spark: Sparkles,
    user: User,
    users: Users
  };
  const Component = icons[name];
  return (
    <Component className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
  );
}
