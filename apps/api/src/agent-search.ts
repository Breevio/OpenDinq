import { generateSearchMatchCard } from "@opendinq/cards";
import { searchOpenAlexAuthors } from "@opendinq/connectors";
import type { ArtifactRecord, CardRecord, EvidenceRecord, OpenDinqStore, PersonProfileRecord, ProfileClaimRecord } from "@opendinq/core";
import {
  createOpenAICompatibleJsonClient,
  getLlmGenerationConfig,
  planProfileGeneration,
  synthesizeClaimsWithEvidence,
  type JsonLlmClient,
  type ProfileGenerationPlan,
  type SynthesisClaim
} from "@opendinq/llm";
import { hybridSearchPeople, type PersonSearchDocument } from "@opendinq/search";
import { z } from "zod";
import { ProfileCandidateResolver, type ProfileCandidate } from "./profile-candidate-resolver.js";
import { createProfileGenerator, type ProfileGenerationSummary } from "./profile-generator.js";
import { compactIdentifier, isHttpUrl, personLikeInput, withTimeout } from "./utils.js";
import { isSafeHttpUrl } from "@opendinq/connectors";

// ---------------------------------------------------------------------------
// Agent search schemas and types (extracted from routes.ts)
// ---------------------------------------------------------------------------

const agentToolCallSchema = z.object({
  tool: z.enum([
    "opendinq_web_search",
    "opendinq_resolve_profile_candidates",
    "opendinq_plan_profile_generation",
    "opendinq_generate_profile_ai",
    "opendinq_get_profile",
    "opendinq_list_cards",
    "opendinq_search_people"
  ]),
  input: z.record(z.unknown()).default({})
});

const agentToolPlanSchema = z.object({
  reasoning: z.string().optional(),
  toolCalls: z.array(agentToolCallSchema).min(1).max(6)
});

export type AgentToolCall = z.infer<typeof agentToolCallSchema>;
const agentToolNames = new Set(agentToolCallSchema.shape.tool.options);
export type AgentToolResult = { tool: AgentToolCall["tool"]; result: unknown };
export type AgentWebEvidence = { title: string; url: string; snippet?: string; reason: string };
export type AgentWebSearchResult = { query: string; results: AgentWebEvidence[]; warnings: string[] };
export type AgentResearchStep = {
  tool: AgentToolCall["tool"];
  title: string;
  status: "completed" | "warning";
  summary: string;
  evidence: Array<{ id: string; type: string; title: string; url?: string; reason: string }>;
  warnings: string[];
};

export type AgentStreamCallbacks = {
  onStep?: (step: AgentResearchStep) => void;
  onToolCall?: (call: AgentToolCall) => void;
  onToolResult?: (result: AgentToolResult) => void;
};

type ImportRecoveryAdvice = {
  kind: "github_token_setup";
  title: string;
  message: string;
  actionLabel: string;
  actionCommand: string;
};

// ---------------------------------------------------------------------------
// Helpers interface – functions that live in routes.ts and are passed in
// ---------------------------------------------------------------------------

export type AgentSearchHelpers = {
  toPublicProfile: (profile: PersonProfileRecord) => PersonProfileRecord;
  publicCards: (cards: CardRecord[]) => CardRecord[];
  generateFromCandidate: (
    candidate: ProfileCandidate,
    rawInput: string,
    generator: ReturnType<typeof createProfileGenerator>,
    llmClient: JsonLlmClient | undefined
  ) => Promise<Awaited<ReturnType<ReturnType<typeof createProfileGenerator>["generate"]>> & { workspaceUrl?: string; llmUsed?: boolean; plan?: ProfileGenerationPlan; recoveryAdvice?: ImportRecoveryAdvice }>;
  planToGenerationInput: (plan: ProfileGenerationPlan) => { displayName?: string; handle?: string; headline?: string; sources: Array<{ type: string; input: string | Record<string, unknown> }> };
  isManualOnlyPlan: (plan: ProfileGenerationPlan) => boolean;
  enrichPlanWithDiscoveredSources: (plan: ProfileGenerationPlan, fetchImpl?: typeof fetch) => Promise<ProfileGenerationPlan>;
  mergeGenerationWarnings: (plan: ProfileGenerationPlan | undefined, planWarnings: string[], generatedWarnings: string[]) => string[];
  synthesizeProfileClaims: (client: JsonLlmClient, plan: ProfileGenerationPlan, person: PersonProfileRecord["person"], bundles: Array<{ source: unknown }>, artifacts: ArtifactRecord[], deterministicClaims: ProfileClaimRecord[]) => Promise<ProfileClaimRecord[]>;
  stringValue: (value: unknown) => string | undefined;
  githubImportRecoveryAdvice: (warnings: string[]) => ImportRecoveryAdvice | undefined;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createCandidateResolver(store: OpenDinqStore, fetchImpl?: typeof fetch): ProfileCandidateResolver {
  return new ProfileCandidateResolver({ store, fetchImpl, githubToken: process.env.GITHUB_TOKEN || undefined });
}

function usedLocalFallback(warnings: string[]): boolean {
  return warnings.some((warning) => warning.includes("using local fallback planning"));
}

// ---------------------------------------------------------------------------
// Agent search entry points
// ---------------------------------------------------------------------------

async function searchProfiles(query: string, profiles: PersonProfileRecord[], helpers: AgentSearchHelpers) {
  const documents: PersonSearchDocument[] = profiles.map((profile) => helpers.toPublicProfile(profile)).map((profile) => ({
    person: profile.person,
    artifacts: profile.artifacts,
    cards: profile.cards,
    claims: profile.claims
  }));
  return hybridSearchPeople(query, documents);
}

export async function runAgentSearch(
  input: string,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient | undefined;
    fetchImpl?: typeof fetch;
    helpers: AgentSearchHelpers;
  }
) {
  return runAgentSearchStreamed(input, options);
}

export async function runAgentSearchStreamed(
  input: string,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient | undefined;
    fetchImpl?: typeof fetch;
    helpers: AgentSearchHelpers;
  } & AgentStreamCallbacks
) {
  const { helpers } = options;
  const callbacks: AgentStreamCallbacks = {
    onStep: options.onStep,
    onToolCall: options.onToolCall,
    onToolResult: options.onToolResult
  };

  // Re-run the agent search with streaming callbacks injected.
  // We inline the logic here to emit events as each tool call completes.
  const preflight = shouldPreflightAmbiguousPersonSearch(input) || shouldPreflightDirectPublicSourceSearch(input)
    ? await runDeterministicCandidatePreflight(input, options)
    : undefined;
  if (preflight) {
    return preflight;
  }

  if (!options.llmClient) {
    if (!canUseDeterministicAgentFallback(input)) {
      return {
        rawInput: input,
        queryType: "natural_language",
        candidates: [],
        needsSelection: false,
        status: "needs_configuration",
        agentUsed: false,
        llmUsed: false,
        toolCalls: [],
        warnings: [
          "Agent search needs OPEN_DINQ_ENABLE_LLM_GENERATION=true, OPEN_DINQ_LLM_MODEL, and OPEN_DINQ_LLM_API_KEY for free-form requests."
        ],
        agentWarnings: ["Agent LLM is not configured; skipped deterministic public-source search to avoid unrelated candidates."]
      };
    }
    const fallback = await runDeterministicSearchAndGenerate(input, options);
    return {
      ...fallback,
      agentUsed: false,
      toolCalls: [],
      agentWarnings: ["Agent LLM is not configured; using deterministic API fallback."]
    };
  }

  const toolPlan = await planAgentToolCallsSafely(input, options.llmClient);
  const toolCalls = toolPlan.toolCalls;
  const toolResults: AgentToolResult[] = [];
  const researchSteps: AgentResearchStep[] = [];
  let generated: (Awaited<ReturnType<typeof options.generator.generate>> & { workspaceUrl?: string; llmUsed?: boolean; plan?: ProfileGenerationPlan }) | undefined;
  let profile: ReturnType<typeof helpers.toPublicProfile> | undefined;
  let cards: CardRecord[] | undefined;
  let search: Awaited<ReturnType<typeof hybridSearchPeople>> | undefined;
  let selectedCandidate: ProfileCandidate | undefined;
  let webEvidence: AgentWebEvidence[] = [];
  const warnings: string[] = [...toolPlan.warnings];
  const llmPlanned = toolPlan.llmPlanned;

  for (const call of toolCalls) {
    callbacks.onToolCall?.(call);
    const result = await executeAgentToolCallSafely(input, call, {
      store: options.store,
      generator: options.generator,
      llmClient: options.llmClient,
      fetchImpl: options.fetchImpl,
      latestHandle: generated?.handle ?? profile?.person.handle,
      selectedCandidate,
      webEvidence,
      helpers
    });
    const step = buildAgentResearchStep(call.tool, result);
    researchSteps.push(step);
    callbacks.onStep?.(step);
    const toolResult: AgentToolResult = { tool: call.tool, result: summarizeAgentToolResult(result) };
    toolResults.push(toolResult);
    callbacks.onToolResult?.(toolResult);

    if (isCandidateResolutionResult(result)) {
      selectedCandidate = result.selectedCandidate;
      if (!selectedCandidate && result.candidates.length === 0 && result.queryType === "role_search") {
        return {
          ...result,
          status: "needs_public_source",
          llmUsed: llmPlanned,
          agentUsed: true,
          toolCalls,
          toolResults,
          researchSteps,
          warnings: [...new Set([
            ...warnings,
            ...result.warnings,
            "No public candidate matched this role search closely enough. Try a person name, handle, or public source before generating a profile."
          ])]
        };
      }
      if (!selectedCandidate && result.candidates.length > 0) {
        return {
          ...result,
          status: "needs_selection",
          llmUsed: llmPlanned,
          agentUsed: true,
          toolCalls,
          toolResults,
          researchSteps,
          warnings: [...new Set([
            ...warnings,
            ...result.warnings,
            "Public candidate search found possible matches, but none was strong enough to select automatically."
          ])]
        };
      }
    }
    if (isAgentWebSearchResult(result)) {
      webEvidence = mergeWebEvidence(webEvidence, result.results);
    }
    if (isGenerationSummary(result)) {
      generated = result;
    }
    if (isPublicProfileResult(result)) {
      profile = result;
    }
    if (isCardsResult(result)) {
      cards = result.cards;
    }
    if (isSearchResult(result) && !isAgentWebSearchResult(result)) {
      search = result.results;
    }
    if (isWarningResult(result)) {
      warnings.push(...result.warnings);
    }
  }

  if (!generated && selectedCandidate && selectedCandidate.sourceType !== "manual") {
    generated = await helpers.generateFromCandidate(selectedCandidate, input, options.generator, options.llmClient);
    warnings.push("Agent tool plan stopped before generation; OpenDinq generated the selected public candidate.");
  }

  if (generated && !profile) {
    const saved = await options.store.getProfile(generated.handle);
    profile = saved ? helpers.toPublicProfile(saved) : undefined;
  }
  if (generated && !cards) {
    cards = helpers.publicCards(await options.store.listCards(generated.handle) ?? []);
  }
  if (generated && !search) {
    search = profile ? await searchProfiles(input, [profile], helpers) : [];
  }
  const manualOnly = generated?.plan ? helpers.isManualOnlyPlan(generated.plan) : false;
  if (manualOnly) {
    warnings.push("No verified public source was found for this request. Review workspace was created, but profile cards are based only on user-provided text.");
    search = profile ? await searchProfiles(input, [profile], helpers) : [];
  }
  const usedAgent = toolCalls.length > 0;
  const usedLlm = llmPlanned;

  // Generate search_match cards from the top search results.
  const searchMatchCards: CardRecord[] = [];
  if (search && search.length > 0) {
    for (const result of search.slice(0, 3)) {
      const card = generateSearchMatchCard({
        query: input,
        person: {
          handle: result.person.handle,
          displayName: result.person.displayName,
          headline: result.person.headline
        },
        matchedClaims: (result.matchedClaims ?? []).map((claim) => ({
          id: claim.id,
          type: claim.type,
          text: claim.text,
          confidence: typeof claim.confidence === "number" ? claim.confidence : 0.5,
          evidence: (claim.evidence ?? []).map((evidence) => ({
            id: evidence.id,
            type: evidence.type === "artifact" || evidence.type === "claim" || evidence.type === "source" || evidence.type === "external" ? evidence.type : "external",
            title: evidence.title,
            url: evidence.url,
            reason: evidence.reason
          }))
        })),
        evidenceSnippets: (result.evidence ?? []).map((evidence) => ({
          id: evidence.id,
          type: evidence.type === "artifact" || evidence.type === "claim" || evidence.type === "source" || evidence.type === "external" ? evidence.type : "external",
          title: evidence.title,
          url: evidence.url,
          reason: evidence.reason
        })),
        scoreBreakdown: result.scoreBreakdown,
        finalScore: result.score
      });
      searchMatchCards.push({
        id: `card-${result.person.handle}-search-match`,
        personId: result.person.handle,
        type: "search_match",
        title: card.title,
        contentMd: card.contentMd,
        dataJson: card.dataJson,
        evidence: card.evidence,
        visibility: "public",
        order: card.order ?? 70
      });
    }
  }

  const allCards = [...(cards ?? []), ...searchMatchCards];

  return {
    runId: generated?.runId,
    handle: generated?.handle ?? profile?.person.handle,
    status: manualOnly ? "needs_public_source" : generated?.status ?? (profile ? "completed" : "needs_review"),
    profileUrl: generated?.profileUrl ?? (profile ? `/u/${profile.person.handle}` : undefined),
    workspaceUrl: generated?.workspaceUrl ?? (profile ? `/u/${profile.person.handle}/workspace` : undefined),
    cardsGenerated: generated?.cardsGenerated ?? allCards.length,
    artifactsImported: generated?.artifactsImported ?? profile?.artifacts.length ?? 0,
    claimsGenerated: generated?.claimsGenerated ?? profile?.claims?.length ?? 0,
    llmUsed: usedLlm,
    agentUsed: usedAgent,
    toolCalls,
    toolResults,
    researchSteps,
    profile,
    cards: allCards,
    searchResults: search,
    searchMatchCards,
    warnings: [...new Set([...(generated?.warnings ?? []), ...warnings])],
    recoveryAdvice: helpers.githubImportRecoveryAdvice([...(generated?.warnings ?? []), ...warnings])
  };
}

// ---------------------------------------------------------------------------
// Agent tool execution
// ---------------------------------------------------------------------------

async function executeAgentToolCallSafely(
  originalInput: string,
  call: AgentToolCall,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient;
    fetchImpl?: typeof fetch;
    latestHandle?: string;
    selectedCandidate?: ProfileCandidate;
    webEvidence?: AgentWebEvidence[];
    helpers: AgentSearchHelpers;
  }
) {
  try {
    return await executeAgentToolCall(originalInput, call, options);
  } catch (error) {
    if (isLlmRuntimeError(error)) {
      return { warnings: [`${call.tool} failed because the LLM request did not complete: ${error instanceof Error ? error.message : "request failed"}`] };
    }
    throw error;
  }
}

function isLlmRuntimeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|aborted|timed out|LLM JSON call failed|LLM JSON response was empty|JSON/i.test(message);
}

async function runDeterministicSearchAndGenerate(
  input: string,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient | undefined;
    fetchImpl?: typeof fetch;
    helpers: AgentSearchHelpers;
  }
) {
  const { helpers } = options;
  const resolution = await createCandidateResolver(options.store, options.fetchImpl).resolve(input);
  if (resolution.autoSelectedCandidateId) {
    const candidate = resolution.candidates.find((item) => item.id === resolution.autoSelectedCandidateId);
    if (candidate) {
      const generated = await helpers.generateFromCandidate(candidate, input, options.generator, options.llmClient);
      const profile = await options.store.getProfile(generated.handle);
      return {
        ...generated,
        profile: profile ? helpers.toPublicProfile(profile) : undefined,
        cards: helpers.publicCards(await options.store.listCards(generated.handle) ?? []),
        resolution
      };
    }
  }
  if (resolution.candidates.length === 0) {
    return {
      ...resolution,
      status: "needs_public_source",
      llmUsed: false,
      warnings: resolution.warnings
    };
  }
  return { ...resolution, status: "needs_selection", llmUsed: false, warnings: resolution.warnings };
}

async function runDeterministicCandidatePreflight(
  input: string,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient | undefined;
    fetchImpl?: typeof fetch;
    helpers: AgentSearchHelpers;
  }
) {
  const resolution = await createCandidateResolver(options.store, options.fetchImpl).resolve(input);
  if (resolution.candidates.length === 0) {
    return undefined;
  }
  const autoCandidate = resolution.candidates.find((item) => item.id === resolution.autoSelectedCandidateId);
  if (autoCandidate?.sourceType === "existing_profile") {
    return undefined;
  }
  if (resolution.autoSelectedCandidateId) {
    const generated = await runDeterministicSearchAndGenerate(input, options);
    return {
      ...generated,
      agentUsed: false,
      agentWarnings: ["Public candidate search selected a strong match before agent planning."]
    };
  }
  return {
    ...resolution,
    status: "needs_selection",
    llmUsed: false,
    agentUsed: false,
    toolCalls: [],
    agentWarnings: ["Public candidate search found multiple possible matches. Select one before generation."]
  };
}

function shouldPreflightAmbiguousPersonSearch(input: string): boolean {
  const terms = deterministicAgentQueryTerms(input);
  return terms.length >= 2 && terms.length <= 4 && terms.every((term) => /^[a-z]+$/.test(term));
}

function shouldPreflightDirectPublicSourceSearch(input: string): boolean {
  const trimmed = input.trim();
  return isHttpUrl(trimmed)
    || /https?:\/\/\S+/i.test(trimmed)
    || /\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/i.test(trimmed)
    || /\b\d{4}\.\d{4,5}(?:v\d+)?\b/i.test(trimmed)
    || /\bA\d{4,}\b/i.test(trimmed)
    || /(?:github\.com\/|github\s+(?:user|profile|handle)?\s*[:=]?\s*|(?:^|\s)@[A-Za-z0-9][A-Za-z0-9-]{1,38}(?:\s|$))/i.test(trimmed);
}

function canUseDeterministicAgentFallback(input: string): boolean {
  const trimmed = input.trim();
  return (
    isHttpUrl(trimmed) ||
    /^[A-Za-z0-9-]{2,39}$/.test(trimmed) && !/^[A-Z]\d+$/i.test(trimmed) ||
    /^A\d{4,}$/i.test(trimmed) ||
    /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(trimmed) ||
    /^\d{4}\.\d{4,5}(v\d+)?$/i.test(trimmed) ||
    deterministicAgentQueryTerms(trimmed).length > 0
  );
}

function deterministicAgentQueryTerms(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((term) => term.length > 1 && !agentRequestStopwords.has(term) && !/^\d+$/.test(term))
    .slice(0, 4);
}

async function planAgentToolCalls(input: string, client: JsonLlmClient): Promise<AgentToolCall[]> {
  const json = await client.completeJson({
    system: [
      "Return JSON only for an OpenDinq agent tool plan.",
      "Schema: {reasoning?: string, toolCalls: [{tool,input}]}",
      "Available tools:",
      "- opendinq_web_search {query}",
      "- opendinq_plan_profile_generation {input}",
      "- opendinq_resolve_profile_candidates {query}",
      "- opendinq_generate_profile_ai {input}",
      "- opendinq_get_profile {handle}",
      "- opendinq_list_cards {handle}",
      "- opendinq_search_people {query}",
      "For a natural-language request to find or research a person, call opendinq_web_search and opendinq_resolve_profile_candidates before opendinq_generate_profile_ai.",
      "After generation, call opendinq_get_profile and opendinq_list_cards using the generated handle when available.",
      "Do not invent private data, secrets, or non-public sources."
    ].join("\n"),
    user: JSON.stringify({ input })
  });
  const parsed = agentToolPlanSchema.safeParse(normalizeAgentToolPlan(json));
  if (!parsed.success) {
    return defaultAgentToolPlan(input);
  }
  return parsed.data.toolCalls;
}

async function planAgentToolCallsSafely(input: string, client: JsonLlmClient): Promise<{ toolCalls: AgentToolCall[]; warnings: string[]; llmPlanned: boolean }> {
  try {
    return {
      toolCalls: await withTimeout(planAgentToolCalls(input, client), agentPlanningTimeoutMs(), "Agent tool planning timed out."),
      warnings: [],
      llmPlanned: true
    };
  } catch (error) {
    if (isLlmRuntimeError(error)) {
      return {
        toolCalls: defaultAgentToolPlan(input),
        warnings: [`Agent tool planning failed because the LLM request did not complete: ${error instanceof Error ? error.message : "request failed"}`],
        llmPlanned: false
      };
    }
    throw error;
  }
}

function agentPlanningTimeoutMs(): number {
  const configured = Number(process.env.OPEN_DINQ_AGENT_PLANNING_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 15000;
}

function normalizeAgentToolPlan(json: unknown): unknown {
  if (!json || typeof json !== "object") {
    return json;
  }
  const record = json as Record<string, unknown>;
  const rawCalls = firstArray(record.toolCalls, record.tool_calls, record.tools, record.calls, record.plan);
  if (!rawCalls) {
    return json;
  }
  return {
    reasoning: typeof record.reasoning === "string" ? record.reasoning : undefined,
    toolCalls: rawCalls.map(normalizeAgentToolCall).filter((call): call is AgentToolCall => Boolean(call))
  };
}

function firstArray(...values: unknown[]) {
  return values.find((value): value is unknown[] => Array.isArray(value));
}

function normalizeAgentToolCall(value: unknown): AgentToolCall | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const tool = agentToolNameValue(record.tool ?? record.name ?? record.function);
  if (!tool || !agentToolNames.has(tool as AgentToolCall["tool"])) {
    return undefined;
  }
  return {
    tool: tool as AgentToolCall["tool"],
    input: inputRecord(record.input ?? record.arguments ?? record.args ?? {})
  };
}

function agentToolNameValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return typeof record.name === "string" ? record.name : undefined;
  }
  return undefined;
}

function inputRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function defaultAgentToolPlan(input: string): AgentToolCall[] {
  return [
    { tool: "opendinq_resolve_profile_candidates", input: { query: input } },
    { tool: "opendinq_web_search", input: { query: input } },
    { tool: "opendinq_generate_profile_ai", input: { input } },
    { tool: "opendinq_get_profile", input: {} },
    { tool: "opendinq_list_cards", input: {} },
    { tool: "opendinq_search_people", input: { query: input } }
  ];
}

async function executeAgentToolCall(
  originalInput: string,
  call: AgentToolCall,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient;
    fetchImpl?: typeof fetch;
    latestHandle?: string;
    selectedCandidate?: ProfileCandidate;
    webEvidence?: AgentWebEvidence[];
    helpers: AgentSearchHelpers;
  }
): Promise<unknown> {
  const { helpers } = options;
  if (call.tool === "opendinq_web_search") {
    const query = helpers.stringValue(call.input.query) ?? helpers.stringValue(call.input.input) ?? originalInput;
    return searchPublicWebEvidence(query, {
      fetchImpl: options.fetchImpl,
      selectedCandidate: options.selectedCandidate
    });
  }
  if (call.tool === "opendinq_resolve_profile_candidates") {
    const query = helpers.stringValue(call.input.query) ?? helpers.stringValue(call.input.input) ?? originalInput;
    const resolver = createCandidateResolver(options.store, options.fetchImpl);
    const resolution = await resolver.resolve(query);
    const fallbackResolution = resolution.candidates.length === 0 && query !== originalInput
      ? await resolver.resolve(originalInput)
      : undefined;
    const finalResolution = fallbackResolution && fallbackResolution.candidates.length > 0 ? fallbackResolution : resolution;
    const inferredGithub = inferredAgentGithubCandidate(query, finalResolution.candidates);
    const candidates = inferredGithub ? [inferredGithub, ...finalResolution.candidates] : finalResolution.candidates;
    const selectedCandidate = inferredGithub ?? selectAgentCandidate(candidates, finalResolution.autoSelectedCandidateId, query);
    return {
      ...finalResolution,
      candidates,
      selectedCandidate,
      warnings: [...new Set([...(resolution.warnings ?? []), ...(fallbackResolution?.warnings ?? [])])]
    };
  }
  if (call.tool === "opendinq_plan_profile_generation") {
    const input = helpers.stringValue(call.input.input) ?? originalInput;
    return { plan: await helpers.enrichPlanWithDiscoveredSources(await planProfileGeneration(input, { client: options.llmClient }), options.fetchImpl), llmUsed: true };
  }
  if (call.tool === "opendinq_generate_profile_ai") {
    const input = helpers.stringValue(call.input.input) ?? originalInput;
    if (options.selectedCandidate && options.selectedCandidate.sourceType !== "manual") {
      const candidate = withWebEvidenceSources(options.selectedCandidate, options.webEvidence ?? []);
      const generated = await helpers.generateFromCandidate(candidate, input, options.generator, options.llmClient);
      return {
        ...generated,
        warnings: [
          `OpenDinq selected a public ${options.selectedCandidate.sourceType} candidate before generation.`,
          ...helpers.mergeGenerationWarnings(generated.plan, [], generated.warnings)
        ]
      };
    }
    const basePlan = await planProfileGeneration(input, { client: options.llmClient });
    const plan = await helpers.enrichPlanWithDiscoveredSources(basePlan, options.fetchImpl);
    if (helpers.isManualOnlyPlan(basePlan) && !helpers.isManualOnlyPlan(plan) && !options.selectedCandidate) {
      const guardedResolution = await guardManualOnlyGeneration(input, options);
      if (guardedResolution) {
        return guardedResolution;
      }
    }
    const resolved = await resolveManualOnlyPlanCandidate(plan, input, options);
    if (resolved) {
      return resolved;
    }
    const guardedResolution = await guardManualOnlyGeneration(input, options);
    if (guardedResolution) {
      return guardedResolution;
    }
    const aiGenerator = createProfileGenerator({
      store: options.store,
      fetchImpl: options.fetchImpl,
      githubToken: process.env.GITHUB_TOKEN || undefined,
      synthesizeClaims: async ({ person, bundles, artifacts, deterministicClaims }) => helpers.synthesizeProfileClaims(options.llmClient, plan, person, bundles, artifacts, deterministicClaims)
    });
    const generated = await aiGenerator.generate(helpers.planToGenerationInput(plan) as Parameters<typeof aiGenerator.generate>[0]);
    return {
      ...generated,
      workspaceUrl: `/u/${generated.handle}/workspace`,
      llmUsed: true,
      plan,
      warnings: helpers.mergeGenerationWarnings(plan, plan.warnings, generated.warnings),
      recoveryAdvice: helpers.githubImportRecoveryAdvice(helpers.mergeGenerationWarnings(plan, plan.warnings, generated.warnings))
    };
  }
  if (call.tool === "opendinq_get_profile") {
    const handle = toolHandleValue(call.input.handle, options.latestHandle, helpers.stringValue);
    if (!handle) {
      return { warnings: ["opendinq_get_profile skipped because no handle was available."] };
    }
    const profile = await options.store.getProfile(handle);
    return profile ? helpers.toPublicProfile(profile) : { warnings: [`Profile ${handle} was not found.`] };
  }
  if (call.tool === "opendinq_list_cards") {
    const handle = toolHandleValue(call.input.handle, options.latestHandle, helpers.stringValue);
    if (!handle) {
      return { warnings: ["opendinq_list_cards skipped because no handle was available."] };
    }
    return { handle, cards: helpers.publicCards(await options.store.listCards(handle) ?? []) };
  }
  const query = helpers.stringValue(call.input.query) ?? originalInput;
  return { query, results: await searchProfiles(query, await options.store.listProfiles(), helpers) };
}

function toolHandleValue(value: unknown, latestHandle: string | undefined, stringValue: AgentSearchHelpers["stringValue"]): string | undefined {
  const handle = stringValue(value);
  if (!handle || /\{\{[^}]+\}\}|generated_handle|latest_handle/i.test(handle)) {
    return latestHandle;
  }
  return handle;
}

function selectAgentCandidate(candidates: ProfileCandidate[], autoSelectedCandidateId: string | undefined, query: string): ProfileCandidate | undefined {
  const autoSelected = candidates.find((candidate) => candidate.id === autoSelectedCandidateId);
  if (autoSelected) {
    return autoSelected;
  }
  const normalizedQuery = query.trim().toLowerCase();
  return candidates.find((candidate) => candidate.sourceType === "github" && candidate.handle && queryContainsIdentifier(normalizedQuery, candidate.handle))
    ?? candidates.find((candidate) => candidate.sourceId && queryContainsIdentifier(normalizedQuery, candidate.sourceId))
    ?? candidates.find((candidate) => (candidate.sources?.length ?? 0) >= 2 && candidate.confidence >= 0.82)
    ?? candidates.find((candidate) => candidate.confidence >= 0.86);
}

export async function searchPublicWebEvidence(
  query: string,
  options: {
    fetchImpl?: typeof fetch;
    selectedCandidate?: ProfileCandidate;
  }
): Promise<AgentWebSearchResult> {
  const warnings: string[] = [];
  const discovered = fallbackWebEvidence(query, options.selectedCandidate);
  const configured = await configuredWebSearch(query, options.fetchImpl).catch((error: unknown) => {
    warnings.push(`Configured web search failed: ${error instanceof Error ? error.message : "request failed"}`);
    return [];
  });
  return {
    query,
    results: mergeWebEvidence(discovered, configured).slice(0, 5),
    warnings
  };
}

async function configuredWebSearch(query: string, fetchImpl: typeof fetch = fetch): Promise<AgentWebEvidence[]> {
  const endpoint = process.env.OPEN_DINQ_WEB_SEARCH_URL;
  if (!endpoint) {
    return [];
  }
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.OPEN_DINQ_WEB_SEARCH_API_KEY ? { authorization: `Bearer ${process.env.OPEN_DINQ_WEB_SEARCH_API_KEY}` } : {})
    },
    body: JSON.stringify({ query })
  });
  if (!response.ok) {
    throw new Error(`web search returned ${response.status}`);
  }
  const json = await response.json() as unknown;
  return normalizeWebSearchResults(json);
}

function normalizeWebSearchResults(json: unknown): AgentWebEvidence[] {
  const items = Array.isArray(json)
    ? json
    : Array.isArray((json as { results?: unknown }).results)
      ? (json as { results: unknown[] }).results
      : [];
  const results: AgentWebEvidence[] = [];
  for (const item of items) {
    const record = item as { title?: unknown; url?: unknown; link?: unknown; snippet?: unknown; description?: unknown };
    const url = typeof record.url === "string" ? record.url : typeof record.link === "string" ? record.link : undefined;
    if (!url || !isSafeHttpUrl(url)) {
      continue;
    }
    results.push({
      title: typeof record.title === "string" ? record.title : new URL(url).hostname,
      url,
      snippet: typeof record.snippet === "string" ? record.snippet : typeof record.description === "string" ? record.description : undefined,
      reason: "Web search returned this public source."
    });
  }
  return results;
}

function fallbackWebEvidence(query: string, selectedCandidate: ProfileCandidate | undefined): AgentWebEvidence[] {
  const sources: AgentWebEvidence[] = [];
  if (selectedCandidate?.sourceUrl && isSafeHttpUrl(selectedCandidate.sourceUrl)) {
    sources.push({
      title: selectedCandidate.displayName,
      url: selectedCandidate.sourceUrl,
      reason: `Selected ${selectedCandidate.sourceType} candidate has a public profile page.`
    });
  }
  const githubHandle = inferredGithubHandleFromAgentInput(query);
  if (githubHandle) {
    sources.push({
      title: `GitHub profile ${githubHandle}`,
      url: `https://github.com/${githubHandle}`,
      reason: "Agent inferred this public profile page from the user request."
    });
  }
  return mergeWebEvidence([], sources);
}

function mergeWebEvidence(existing: AgentWebEvidence[], incoming: AgentWebEvidence[]): AgentWebEvidence[] {
  const byUrl = new Map<string, AgentWebEvidence>();
  for (const item of [...existing, ...incoming]) {
    byUrl.set(item.url.replace(/\/$/, ""), item);
  }
  return [...byUrl.values()];
}

function withWebEvidenceSources(candidate: ProfileCandidate, evidence: AgentWebEvidence[]): ProfileCandidate {
  if (!evidence.length) {
    return candidate;
  }
  return {
    ...candidate,
    sources: [
      ...(candidate.sources ?? [{
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        sourceUrl: candidate.sourceUrl,
        confidence: candidate.confidence,
        evidencePreview: candidate.evidencePreview,
        reasons: candidate.reasons,
        warnings: candidate.warnings
      }]),
      ...evidence.map((item) => ({
        sourceType: "website" as const,
        sourceUrl: item.url,
        sourceId: item.url,
        confidence: 0.82,
        evidencePreview: [{
          id: item.url,
          type: "external" as const,
          title: item.title,
          url: item.url,
          reason: item.reason
        }],
        reasons: [item.reason],
        warnings: []
      }))
    ]
  };
}

function inferredAgentGithubCandidate(query: string, candidates: ProfileCandidate[]): ProfileCandidate | undefined {
  const handle = inferredGithubHandleFromAgentInput(query);
  if (!handle) {
    return undefined;
  }
  const directMatch = candidates.find((candidate) => candidate.sourceType === "github" && candidate.handle?.toLowerCase() === handle.toLowerCase());
  if (directMatch) {
    return directMatch;
  }
  if (candidates.some((candidate) => candidate.confidence >= 0.9 && candidate.sourceType !== "github")) {
    return undefined;
  }
  return {
    id: `github:${handle.toLowerCase()}`,
    displayName: handle,
    handle,
    sourceType: "github",
    sourceId: handle,
    sourceUrl: `https://github.com/${handle}`,
    confidence: 0.91,
    evidencePreview: [{
      id: `https://github.com/${handle}`,
      type: "external",
      title: `GitHub profile ${handle}`,
      url: `https://github.com/${handle}`,
      reason: "Agent inferred this GitHub handle from the user request."
    }],
    reasons: ["Agent inferred a handle-like public GitHub source from the request."],
    warnings: []
  };
}

function inferredGithubHandleFromAgentInput(input: string): string | undefined {
  const text = input.trim();
  const explicit = text.match(/(?:github\.com\/|github\s+(?:user|profile|handle)?\s*[:=]?\s*|@)([A-Za-z0-9-]{2,39})/i)?.[1];
  if (explicit && isGithubHandleLike(explicit)) {
    return explicit;
  }
  if (!hasAgentProfileIntent(text)) {
    return undefined;
  }
  const terms = deterministicAgentQueryTerms(text);
  if (terms.length !== 1) {
    return undefined;
  }
  const [token] = terms;
  return token && isGithubHandleLike(token) && token === token.toLowerCase() ? token : undefined;
}

function hasAgentProfileIntent(input: string): boolean {
  return /research|profile|card|generate|public source|evidence|调研|研究|资料|卡片|生成|画像/i.test(input);
}

function isGithubHandleLike(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{1,38}$/.test(value) && !/^[A-Z]\d+$/i.test(value) && !value.endsWith("-");
}

const agentRequestStopwords = new Set([
  "a",
  "an",
  "and",
  "about",
  "activity",
  "backed",
  "card",
  "cards",
  "create",
  "evidence",
  "find",
  "for",
  "from",
  "generate",
  "github",
  "look",
  "lookup",
  "profile",
  "profiles",
  "public",
  "research",
  "return",
  "search",
  "source",
  "sources",
  "the",
  "user",
  "with"
]);

function queryContainsIdentifier(normalizedQuery: string, identifier: string): boolean {
  const normalizedIdentifier = identifier.toLowerCase().replace(/^https?:\/\/(?:www\.)?github\.com\//, "").replace(/\/$/, "");
  const queryTerms = deterministicAgentQueryTerms(normalizedQuery);
  if (normalizedQuery === normalizedIdentifier) {
    return true;
  }
  if (queryTerms.length > 1) {
    return compactIdentifier(normalizedIdentifier) === queryTerms.join("");
  }
  return normalizedQuery.split(/[^a-z0-9-]+/).includes(normalizedIdentifier);
}


async function resolveManualOnlyPlanCandidate(
  plan: ProfileGenerationPlan,
  input: string,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient;
    fetchImpl?: typeof fetch;
    helpers: AgentSearchHelpers;
  }
) {
  const { helpers } = options;
  if (!helpers.isManualOnlyPlan(plan)) {
    return undefined;
  }
  const explicitHandle = inferredGithubHandleFromAgentInput(input);
  const candidates = [
    explicitHandle && plan.subject.handle?.toLowerCase() === explicitHandle.toLowerCase() ? plan.subject.handle : undefined,
    plan.subject.displayName,
    personLikeInput(input),
    input
  ]
    .filter((value): value is string => Boolean(value?.trim()));
  for (const query of [...new Set(candidates)]) {
    const resolution = await createCandidateResolver(options.store, options.fetchImpl).resolve(query);
    const candidate = resolution.candidates.find((item) => item.sourceType === "github" && item.handle?.toLowerCase() === query.toLowerCase());
    if (candidate && candidate.sourceType !== "manual" && candidate.sourceType !== "existing_profile") {
      const generated = await helpers.generateFromCandidate(candidate, input, options.generator, options.llmClient);
      return {
        ...generated,
        warnings: [
          `OpenDinq resolved "${query}" to a public ${candidate.sourceType} source before generation.`,
          ...generated.warnings
        ]
      };
    }
    const publicCandidates = resolution.candidates.filter((item) => item.sourceType !== "manual" && item.sourceType !== "existing_profile");
    if (publicCandidates.length > 0) {
      return {
        ...resolution,
        candidates: publicCandidates,
        status: "needs_selection",
        needsSelection: true,
        warnings: [
          ...resolution.warnings,
          "Public candidate search found possible matches. Select one before generating a user-provided review workspace."
        ]
      };
    }
  }
  return undefined;
}

async function guardManualOnlyGeneration(
  input: string,
  options: {
    store: OpenDinqStore;
    fetchImpl?: typeof fetch;
    helpers: AgentSearchHelpers;
  }
) {
  const resolution = await createCandidateResolver(options.store, options.fetchImpl).resolve(input);
  const publicCandidates = resolution.candidates.filter((candidate) => candidate.sourceType !== "manual" && candidate.sourceType !== "existing_profile");
  if (publicCandidates.length === 0) {
    return undefined;
  }
  return {
    ...resolution,
    candidates: publicCandidates,
    status: "needs_selection",
    needsSelection: true,
    warnings: [
      ...resolution.warnings,
      "Public candidate search found possible matches. Select one before generating a user-provided review workspace."
    ]
  };
}

// ---------------------------------------------------------------------------
// Agent result summarization
// ---------------------------------------------------------------------------

function summarizeAgentToolResult(result: unknown): unknown {
  if (isGenerationSummary(result)) {
    return {
      runId: result.runId,
      handle: result.handle,
      status: result.status,
      profileUrl: result.profileUrl,
      workspaceUrl: result.workspaceUrl,
      cardsGenerated: result.cardsGenerated,
      artifactsImported: result.artifactsImported,
      claimsGenerated: result.claimsGenerated,
      warnings: result.warnings
    };
  }
  if (isPublicProfileResult(result)) {
    return {
      person: result.person,
      artifactCount: result.artifacts.length,
      cardCount: result.cards.length,
      claimCount: result.claims?.length ?? 0
    };
  }
  if (isCardsResult(result)) {
    return { handle: result.handle, cardCount: result.cards.length };
  }
  if (isAgentWebSearchResult(result)) {
    return { query: result.query, resultCount: result.results.length, warnings: result.warnings };
  }
  if (isSearchResult(result)) {
    return { query: result.query, resultCount: result.results.length };
  }
  if (isCandidateResolutionResult(result)) {
    return {
      rawInput: result.rawInput,
      queryType: result.queryType,
      candidateCount: result.candidates.length,
      selectedCandidate: result.selectedCandidate
        ? {
          id: result.selectedCandidate.id,
          displayName: result.selectedCandidate.displayName,
          handle: result.selectedCandidate.handle,
          sourceType: result.selectedCandidate.sourceType,
          sourceUrl: result.selectedCandidate.sourceUrl,
          confidence: result.selectedCandidate.confidence
        }
        : undefined,
      warnings: result.warnings
    };
  }
  return result;
}

function buildAgentResearchStep(tool: AgentToolCall["tool"], result: unknown): AgentResearchStep {
  const warnings = warningsFromResult(result);
  return {
    tool,
    title: agentStepTitle(tool),
    status: warnings.length ? "warning" : "completed",
    summary: agentStepSummary(tool, result),
    evidence: agentStepEvidence(result),
    warnings
  };
}

function agentStepTitle(tool: AgentToolCall["tool"]): string {
  const titles: Record<AgentToolCall["tool"], string> = {
    opendinq_resolve_profile_candidates: "Find public candidates",
    opendinq_web_search: "Search the public web",
    opendinq_plan_profile_generation: "Plan profile generation",
    opendinq_generate_profile_ai: "Generate evidence-backed profile",
    opendinq_get_profile: "Load generated profile",
    opendinq_list_cards: "Load profile cards",
    opendinq_search_people: "Rank matching profiles"
  };
  return titles[tool];
}

function agentStepSummary(tool: AgentToolCall["tool"], result: unknown): string {
  if (isCandidateResolutionResult(result)) {
    const selected = result.selectedCandidate ? ` Selected ${result.selectedCandidate.displayName} from ${result.selectedCandidate.sourceType}.` : "";
    return `Found ${result.candidates.length} public candidate${result.candidates.length === 1 ? "" : "s"}.${selected}`;
  }
  if (isAgentWebSearchResult(result)) {
    return `Found ${result.results.length} public web source${result.results.length === 1 ? "" : "s"} for "${result.query}".`;
  }
  if (isGenerationSummary(result)) {
    return `Created ${result.handle} with ${result.artifactsImported} artifact${result.artifactsImported === 1 ? "" : "s"}, ${result.claimsGenerated} claim${result.claimsGenerated === 1 ? "" : "s"}, and ${result.cardsGenerated} card${result.cardsGenerated === 1 ? "" : "s"}.`;
  }
  if (isPublicProfileResult(result)) {
    return `Loaded ${result.person.displayName} with ${result.artifacts.length} artifact${result.artifacts.length === 1 ? "" : "s"} and ${result.cards.length} card${result.cards.length === 1 ? "" : "s"}.`;
  }
  if (isCardsResult(result)) {
    return `Loaded ${result.cards.length} card${result.cards.length === 1 ? "" : "s"} for ${result.handle}.`;
  }
  if (isSearchResult(result)) {
    return `Ranked ${result.results.length} matching profile${result.results.length === 1 ? "" : "s"} for "${result.query}".`;
  }
  if (tool === "opendinq_plan_profile_generation") {
    return "Built a generation plan for the request.";
  }
  return "Tool completed.";
}

function agentStepEvidence(result: unknown): AgentResearchStep["evidence"] {
  if (isCandidateResolutionResult(result)) {
    return result.selectedCandidate?.evidencePreview ?? result.candidates.flatMap((candidate) => candidate.evidencePreview).slice(0, 5);
  }
  if (isAgentWebSearchResult(result)) {
    return result.results.map((item) => ({
      id: item.url,
      type: "external",
      title: item.title,
      url: item.url,
      reason: item.reason
    })).slice(0, 5);
  }
  if (isPublicProfileResult(result)) {
    return [
      ...result.artifacts.slice(0, 3).map((artifact) => ({
        id: artifact.id ?? artifact.url ?? artifact.title,
        type: "artifact" as const,
        title: artifact.title,
        url: artifact.url,
        reason: "Imported artifact is available on the generated profile."
      })),
      ...result.cards.flatMap((card) => card.evidence ?? []).slice(0, 3)
    ].slice(0, 5);
  }
  if (isCardsResult(result)) {
    return result.cards.flatMap((card) => card.evidence ?? []).slice(0, 5);
  }
  if (isSearchResult(result)) {
    return result.results.flatMap((item) => item.evidence ?? []).slice(0, 5);
  }
  return [];
}

function warningsFromResult(result: unknown): string[] {
  return isWarningResult(result) ? result.warnings : [];
}

// ---------------------------------------------------------------------------
// Agent result type guards
// ---------------------------------------------------------------------------

function isCandidateResolutionResult(value: unknown): value is Awaited<ReturnType<ProfileCandidateResolver["resolve"]>> & { selectedCandidate?: ProfileCandidate } {
  const record = value as { rawInput?: unknown; candidates?: unknown; needsSelection?: unknown };
  return typeof record?.rawInput === "string" && Array.isArray(record.candidates) && typeof record.needsSelection === "boolean";
}

function isAgentWebSearchResult(value: unknown): value is AgentWebSearchResult {
  const record = value as { query?: unknown; results?: unknown; warnings?: unknown };
  return typeof record?.query === "string" && Array.isArray(record.results) && Array.isArray(record.warnings);
}

function isGenerationSummary(value: unknown): value is Awaited<ReturnType<ReturnType<typeof createProfileGenerator>["generate"]>> & { workspaceUrl?: string; llmUsed?: boolean; plan?: ProfileGenerationPlan; recoveryAdvice?: ImportRecoveryAdvice } {
  const record = value as { runId?: unknown; handle?: unknown; cardsGenerated?: unknown; artifactsImported?: unknown; claimsGenerated?: unknown };
  return typeof record?.runId === "string" && typeof record.handle === "string" && typeof record.cardsGenerated === "number" && typeof record.artifactsImported === "number" && typeof record.claimsGenerated === "number";
}

function isPublicProfileResult(value: unknown): value is PersonProfileRecord {
  const record = value as { person?: { handle?: unknown }; cards?: unknown; artifacts?: unknown };
  return typeof record?.person?.handle === "string" && Array.isArray(record.cards) && Array.isArray(record.artifacts);
}

function isCardsResult(value: unknown): value is { handle: string; cards: CardRecord[] } {
  const record = value as { handle?: unknown; cards?: unknown };
  return typeof record?.handle === "string" && Array.isArray(record.cards);
}

function isSearchResult(value: unknown): value is { query: string; results: Awaited<ReturnType<typeof hybridSearchPeople>> } {
  const record = value as { query?: unknown; results?: unknown };
  return typeof record?.query === "string" && Array.isArray(record.results);
}

function isWarningResult(value: unknown): value is { warnings: string[] } {
  return Array.isArray((value as { warnings?: unknown }).warnings);
}
