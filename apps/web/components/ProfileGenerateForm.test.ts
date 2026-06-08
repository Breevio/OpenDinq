import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ProfileGenerateForm.tsx"), "utf8");

describe("/generate search-first UI", () => {
  it("uses a single primary input and candidate preview action", () => {
    expect(source).toContain("initialQuery = \"\"");
    expect(source).toContain("Profile generation input");
    expect(source).toContain("Paste a public profile URL, enter a handle, or describe the person you want to research");
    expect(source).toContain("Source</span>");
    expect(source).toContain("Match</span>");
    expect(source).toContain("Cards</span>");
    expect(source).toContain("Preview candidates");
    expect(source).toContain("/api/profiles/resolve");
    expect(source).toContain("/api/profiles/agent-search");
    expect(source).toContain("const queryFromUrl = initialQuery.trim()");
    expect(source).toContain("void runSearchAndGenerate(queryFromUrl)");
    expect(source).toContain("OpenDinq searched multiple public sources");
    expect(source).toContain("How OpenDinq found this profile");
  });

  it("does not render canned real-person example chips", () => {
    expect(source).not.toContain("Jiajun Wu");
    expect(source).not.toContain("Linus Torvalds");
    expect(source).not.toContain("example-chips");
  });

  it("keeps advanced source fields collapsed", () => {
    expect(source).toContain("<details className=\"advanced-sources\">");
    expect(source).toContain("<summary>Advanced sources</summary>");
    expect(source).toContain("/api/profiles/generate");
  });

  it("keeps advanced fields empty by default and uses neutral placeholders", () => {
    expect(source).toContain("useState(() => initialQuery)");
    expect(source).toContain("const [displayName, setDisplayName] = useState(\"\")");
    expect(source).toContain("placeholder=\"Name to show on the profile\"");
    expect(source).toContain("placeholder=\"profile-handle\"");
    expect(source).toContain("placeholder=\"Short role or summary\"");
    expect(source).toContain("placeholder=\"Source title\"");
    expect(source).toContain("placeholder=\"Notes about why this source matters\"");
    expect(source).not.toContain("Ada Builder");
    expect(source).not.toContain("Built an agent workflow");
  });

  it("renders candidate resolution and selected candidate generation", () => {
    expect(source).toContain("Review ");
    expect(source).toContain("We found a likely public match");
    expect(source).toContain("Recommended");
    expect(source).toContain("Needs confirmation");
    expect(source).toContain("Use with caution");
    expect(source).toContain("candidate-ribbon");
    expect(source).toContain("candidateEvidenceLabel(candidate)");
    expect(source).toContain("Use recommended source");
    expect(source).toContain("Review this source");
    expect(source).toContain("Best current source");
    expect(source).toContain("Compare before generating");
    expect(source).toContain("function candidateDecisionReason(candidate: ProfileCandidate)");
    expect(source).toContain("Best match.");
    expect(source).toContain("Check identity.");
    expect(source).toContain("/api/profiles/generate-from-candidate");
    expect(source).not.toContain("Math.round(candidate.confidence * 100)");
    expect(source).not.toContain("source preview");
  });

  it("uses stable source subtitles instead of raw source-metadata headlines", () => {
    expect(source).toContain("function candidateSubtitle(candidate: ProfileCandidate)");
    expect(source).toContain("return \"GitHub profile\"");
    expect(source).toContain("return \"OpenAlex author record\"");
    expect(source).toContain("return \"ORCID record\"");
    expect(source).toContain("return \"arXiv reference\"");
    expect(source).toContain("candidate.kind === \"biography\"");
    expect(source).toContain("return \"Public website\"");
    expect(source).toContain("return \"Existing OpenDinq profile\"");
    expect(source).toContain("/\\bworks\\b|\\bcitations\\b|h-index|github user search result/i.test(candidate.headline)");
    expect(source).not.toContain("{candidate.headline ? <span>{candidate.headline}</span> : null}");
  });

  it("separates connector warnings from selection-state messaging", () => {
    expect(source).toContain("const visibleWarnings = response.warnings.filter");
    expect(source).toContain("response.needsSelection");
    expect(source).toContain("/multiple possible matches\\. select one before generation\\./i");
    expect(source).toContain("visibleWarnings.map((warning) => <p className=\"status warning\" key={warning}>{warning}</p>)");
    expect(source).not.toContain("<p className=\"status warning\">{response.warnings.join(\" \")}</p>");
  });

  it("softens candidate-specific warnings before rendering them", () => {
    expect(source).toContain("function visibleCandidateWarnings(candidate: ProfileCandidate): string[]");
    expect(source).toContain("This name may refer to more than one person. Review the source before generating.");
    expect(source).toContain("Review this GitHub profile before generating.");
    expect(source).toContain("Review this ORCID record before generating.");
    expect(source).toContain("Academic records can share the same name. Use this only if the record is clearly the right person.");
    expect(source).toContain("Review this paper reference before generating.");
    expect(source).toContain("Review this public biography before generating.");
    expect(source).toContain("visibleCandidateWarnings(candidate).map((warning) => <p className=\"status warning\" key={`${candidate.id}-${warning}`}>{warning}</p>)");
    expect(source).not.toContain("{candidate.warnings.length ? <p className=\"status warning\">{candidate.warnings.join(\" \")}</p> : null}");
  });

  it("preserves agent warnings when search returns candidates that need selection", () => {
    expect(source).toContain("generated.agentWarnings");
    expect(source).toContain("new Set([...(generated.warnings ?? []), ...(generated.agentWarnings ?? [])])");
  });

  it("does not render candidate selection for empty candidate responses", () => {
    expect(source).toContain("const candidates = generated.candidates ?? []");
    expect(source).toContain("if (generated.handle)");
    expect(source).toContain("setResult(generated)");
    expect(source).toContain("setResolution(generated.needsSelection ? {");
    expect(source).toContain("generated.needsSelection || candidates.length > 0");
    expect(source).toContain("!generated.handle");
  });

  it("uses human-readable candidate source labels instead of raw source type ids", () => {
    expect(source).toContain("Existing profile");
    expect(source).toContain("Web result");
    expect(source).toContain("Public biography");
    expect(source).not.toContain(">existing_profile<");
    expect(source).not.toContain(">source_url<");
  });

  it("hides existing-profile source chips when public sources are also present", () => {
    expect(source).toContain("const publicSourceTypes = sourceTypes.filter((sourceType) => sourceType !== \"existing_profile\" && sourceType !== \"manual\")");
    expect(source).toContain("const visibleSourceTypes = publicSourceTypes.length > 0 ? publicSourceTypes : sourceTypes");
  });

  it("suppresses standalone existing-profile cards when a public-source card with the same handle exists", () => {
    expect(source).toContain("visibleCandidates(response.candidates)");
    expect(source).not.toContain("candidate.sourceType !== \"existing_profile\" || !candidate.handle");
    expect(source).toContain("other.sourceType !== \"existing_profile\"");
    expect(source).toContain("other.handle === candidate.handle");
  });

  it("suppresses weaker single-source cards when a stronger multi-source candidate already represents the same identity", () => {
    expect(source).toContain("isRepresentedByStrongerCandidate(candidate, candidates)");
    expect(source).toContain("const candidateSourceCount = candidate.sources?.length ?? 1");
    expect(source).toContain("(other.sources?.length ?? 1) > candidateSourceCount");
    expect(source).toContain("candidateIdentityMatches(other, candidate)");
    expect(source).toContain("function candidateIdentityKeys(candidate: ProfileCandidate): Set<string>");
  });

  it("also suppresses existing-profile cards when a public-source card has the same normalized display name", () => {
    expect(source).toContain("normalizeCandidateName(other.displayName) === normalizeCandidateName(candidate.displayName)");
    expect(source).toContain("function normalizeCandidateName(value: string): string");
  });

  it("keeps the completion panel product-facing instead of tool-facing", () => {
    expect(source).toContain("Ready");
    expect(source).toContain("Related");
    expect(source).not.toContain("Agent called OpenDinq tools");
    expect(source).not.toContain("tool calls");
    expect(source).not.toContain("Search in Discover");
  });

  it("shows structured recovery advice when generation degrades on GitHub rate limits", () => {
    expect(source).toContain("result.recoveryAdvice");
    expect(source).toContain("GitHubRecoveryPanel");
    expect(source).toContain("retryLatestAction");
    expect(source).toContain("Retry generation");
  });

  it("can retry the latest generation action after token setup", () => {
    expect(source).toContain("type RetryAction =");
    expect(source).toContain("setRetryAction({ kind: \"search\" })");
    expect(source).toContain("setRetryAction({ kind: \"candidate\", candidate })");
    expect(source).toContain("setRetryAction({ kind: \"advanced\" })");
    expect(source).toContain("await runGenerateCandidate(retryAction.candidate)");
  });

  it("softens existing-profile candidate wording instead of showing raw resolver copy", () => {
    expect(source).toContain("Existing profile in OpenDinq");
    expect(source).not.toContain("Reuse this profile if it already represents the person you want to research.");
    expect(source).not.toContain("candidateSummary(candidate)");
    expect(source).not.toContain("Matched an existing OpenDinq profile.");
  });

  it("keeps candidate cards terse instead of rendering source explainer paragraphs", () => {
    expect(source).toContain("candidateEvidenceLabel(candidate)");
    expect(source).toContain("lucide-react");
    expect(source).toContain("function Icon({ name }: { name: IconName })");
    expect(source).toContain("<Component className=\"ui-icon\"");
    expect(source).not.toContain("Public GitHub profile found for");
    expect(source).not.toContain("Public OpenAlex author record found.");
    expect(source).not.toContain("Public ORCID record found.");
    expect(source).not.toContain("Public arXiv reference found.");
    expect(source).not.toContain("Public website source found.");
    expect(source).not.toContain("Public web result found.");
    expect(source).not.toContain("const reasons = candidate.reasons.filter");
    expect(source).not.toContain("<svg className=\"ui-icon\"");
  });
});
