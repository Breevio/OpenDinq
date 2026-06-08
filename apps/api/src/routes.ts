import { generateProfileCards, type CardClaim } from "@opendinq/cards";
import { parseGitHubProfileUrl, searchOpenAlexAuthors } from "@opendinq/connectors";
import { publicRankedClaims } from "@opendinq/core";
import type { ArtifactRecord, CardRecord, EvidenceRecord, IdentitySourceRecord, OpenDinqStore, PersonProfileRecord, ProfileClaimRecord, ProfileSourceRecord } from "@opendinq/core";
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
import { Hono } from "hono";
import { z } from "zod";
import { createDemoProfiles } from "./demo-data.js";
import { ApiNotFoundError, errorResponse } from "./errors.js";
import { ProfileCandidateResolver, type ProfileCandidate } from "./profile-candidate-resolver.js";
import { createProfileGenerator, getProfileRunSummary } from "./profile-generator.js";

export type ApiRouteOptions = {
  store: OpenDinqStore;
  fetchImpl?: typeof fetch;
  llmClient?: JsonLlmClient;
};

const importGitHubSchema = z.object({
  input: z.string().min(1)
});

type ImportRecoveryAdvice = {
  kind: "github_token_setup";
  title: string;
  message: string;
  actionLabel: string;
  actionCommand: string;
};

const profileGenerationSchema = z.object({
  displayName: z.string().min(1).optional(),
  handle: z.string().min(1).optional(),
  headline: z.string().optional(),
  sources: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("github"), input: z.string().min(1) }),
      z.object({ type: z.literal("website"), input: z.string().min(1) }),
      z.object({ type: z.literal("openalex"), input: z.string().min(1) }),
      z.object({ type: z.literal("arxiv"), input: z.string().min(1) }),
      z.object({ type: z.literal("orcid"), input: z.string().min(1) }),
      z.object({
        type: z.literal("manual"),
        input: z.object({
          title: z.string().optional(),
          url: z.string().url().optional(),
          note: z.string().optional(),
          description: z.string().optional()
        })
      })
    ])
  ).min(1)
});

const aiProfileInputSchema = z.object({
  input: z.string().min(1),
  reviewPlan: z.boolean().optional()
});

const candidateGenerationSchema = z.object({
  candidateId: z.string().min(1),
  rawInput: z.string().min(1),
  candidate: z.lazy(() => candidatePayloadSchema).optional()
});

const candidatePayloadSchema: z.ZodType<ProfileCandidate> = z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    headline: z.string().optional(),
    handle: z.string().optional(),
    sourceType: z.enum(["existing_profile", "openalex", "orcid", "arxiv", "github", "website", "manual", "web"]),
    sourceId: z.string().optional(),
    sourceUrl: z.string().optional(),
    confidence: z.number().min(0).max(1),
    evidencePreview: z.array(z.object({
      id: z.string(),
      type: z.enum(["artifact", "claim", "source", "external"]),
      title: z.string(),
      url: z.string().optional(),
      reason: z.string()
    })),
    reasons: z.array(z.string()),
    warnings: z.array(z.string()),
    sources: z.array(z.object({
      sourceType: z.enum(["existing_profile", "openalex", "orcid", "arxiv", "github", "website", "manual", "web"]),
      sourceId: z.string().optional(),
      sourceUrl: z.string().optional(),
      confidence: z.number().min(0).max(1),
      evidencePreview: z.array(z.object({
        id: z.string(),
        type: z.enum(["artifact", "claim", "source", "external"]),
        title: z.string(),
        url: z.string().optional(),
        reason: z.string()
      })),
      reasons: z.array(z.string()),
      warnings: z.array(z.string())
    })).optional()
});

const searchAndGenerateSchema = z.object({
  input: z.string().min(1),
  autoSelect: z.boolean().optional()
});

const agentSearchSchema = z.object({
  input: z.string().min(1)
});

const webSearchSchema = z.object({
  query: z.string().min(1).optional(),
  input: z.string().min(1).optional()
}).refine((value) => value.query || value.input, { message: "query or input is required" });

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

type AgentToolCall = z.infer<typeof agentToolCallSchema>;
const agentToolNames = new Set(agentToolCallSchema.shape.tool.options);
type AgentToolResult = { tool: AgentToolCall["tool"]; result: unknown };
type AgentWebEvidence = { title: string; url: string; snippet?: string; reason: string };
type AgentWebSearchResult = { query: string; results: AgentWebEvidence[]; warnings: string[] };
type AgentResearchStep = {
  tool: AgentToolCall["tool"];
  title: string;
  status: "completed" | "warning";
  summary: string;
  evidence: Array<{ id: string; type: string; title: string; url?: string; reason: string }>;
  warnings: string[];
};

const createNoteCardSchema = z.object({
  title: z.string().min(1),
  contentMd: z.string().min(1)
});

const patchCardSchema = z.object({
  title: z.string().min(1).optional(),
  contentMd: z.string().min(1).optional(),
  visibility: z.enum(["public", "private", "hidden"]).optional(),
  order: z.number().int().optional()
}).strict();

const patchClaimSchema = z.object({
  text: z.string().min(1).optional(),
  type: z.enum(["skill", "role", "project", "research_area", "achievement", "affiliation", "link", "summary"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional()
}).strict();

const publishProfileSchema = z.object({
  publicStatus: z.enum(["draft", "published"])
});

const manualArtifactSchema = z.object({
  type: z.enum(["repo", "paper", "project", "post", "note", "website"]),
  title: z.string().min(1),
  description: z.string().optional(),
  url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional()
});

const importForHandleSchema = z.object({
  handle: z.string().min(1),
  input: z.string().min(1)
});

const importWebsiteSchema = z.object({
  handle: z.string().min(1),
  url: z.string().min(1)
});

export function createApiRoutes(options: ApiRouteOptions) {
  const routes = new Hono();
  const candidateResolver = createCandidateResolver(options.store, options.fetchImpl);
  const generator = createProfileGenerator({
    store: options.store,
    fetchImpl: options.fetchImpl,
    githubToken: process.env.GITHUB_TOKEN || undefined
  });
  const llmClient = getConfiguredLlmClient(options);

  routes.post("/profiles/resolve", async (context) => {
    try {
      const body = aiProfileInputSchema.pick({ input: true }).parse(await context.req.json());
      return context.json(await candidateResolver.resolve(body.input));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/generate-from-candidate", async (context) => {
    try {
      const body = candidateGenerationSchema.parse(await context.req.json());
      const candidate = candidateResolver.getCandidate(body.candidateId) ?? body.candidate;
      if (!candidate) {
        return context.json({ error: { code: "not_found", message: "Candidate was not found. Preview candidates again." } }, 404);
      }
      return context.json(await generateFromCandidate(candidate, body.rawInput, generator, llmClient));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/search-and-generate", async (context) => {
    try {
      const body = searchAndGenerateSchema.parse(await context.req.json());
      const resolution = await candidateResolver.resolve(body.input);
      if (resolution.candidates.length === 0 && descriptiveEnough(body.input)) {
        const generated = await generator.generate({
          displayName: titleFromInput(body.input),
          handle: slugFromInput(body.input),
          sources: [{
            type: "manual",
            input: {
              title: "Review workspace from search input",
              note: body.input,
              description: "No public candidate was found. OpenDinq created a review workspace from the user's description."
            }
          }]
        });
        return context.json({
          ...generated,
          workspaceUrl: `/u/${generated.handle}/workspace`,
          llmUsed: false,
          resolution,
          warnings: [...new Set([...resolution.warnings, ...generated.warnings])]
        });
      }
      if (resolution.needsSelection || !resolution.autoSelectedCandidateId || body.autoSelect === false) {
        return context.json({ ...resolution, status: "needs_selection" });
      }

      const candidate = candidateResolver.getCandidate(resolution.autoSelectedCandidateId);
      if (!candidate) {
        return context.json({ ...resolution, status: "needs_selection", needsSelection: true });
      }

      const generated = await generateFromCandidate(candidate, body.input, generator, llmClient);
      return context.json({ ...generated, resolution });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/agent-search", async (context) => {
    try {
      const body = agentSearchSchema.parse(await context.req.json());
      return context.json(await runAgentSearch(body.input, {
        store: options.store,
        generator,
        llmClient,
        fetchImpl: options.fetchImpl
      }));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/web-search", async (context) => {
    try {
      const body = webSearchSchema.parse(await context.req.json());
      return context.json(await searchPublicWebEvidence(body.query ?? body.input ?? "", { fetchImpl: options.fetchImpl }));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/plan", async (context) => {
    try {
      const body = aiProfileInputSchema.pick({ input: true }).parse(await context.req.json());
      const plan = await enrichPlanWithDiscoveredSources(await planProfileGeneration(body.input, llmClient ? { client: llmClient } : {}), options.fetchImpl);
      const warnings = plan.warnings;
      const llmUsed = Boolean(llmClient) && !usedLocalFallback(warnings);
      return context.json({
        plan: { ...plan, warnings },
        llmUsed,
        warnings
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/generate-ai", async (context) => {
    try {
      const body = aiProfileInputSchema.parse(await context.req.json());
      const plan = await enrichPlanWithDiscoveredSources(await planProfileGeneration(body.input, llmClient ? { client: llmClient } : {}), options.fetchImpl);
      const warnings = [...plan.warnings];
      const llmUsed = Boolean(llmClient) && !usedLocalFallback(warnings);
      const aiGenerator = createProfileGenerator({
        store: options.store,
        fetchImpl: options.fetchImpl,
        githubToken: process.env.GITHUB_TOKEN || undefined,
        synthesizeClaims: llmClient && llmUsed
          ? async ({ person, bundles, artifacts, deterministicClaims }) => synthesizeProfileClaims(llmClient, plan, person, bundles, artifacts, deterministicClaims)
          : undefined
      });
      const generated = await aiGenerator.generate(planToGenerationInput(plan));

      return context.json({
        ...generated,
        workspaceUrl: `/u/${generated.handle}/workspace`,
        llmUsed,
        plan,
        warnings: mergeGenerationWarnings(plan, warnings, generated.warnings),
        recoveryAdvice: githubImportRecoveryAdvice(mergeGenerationWarnings(plan, warnings, generated.warnings))
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/generate", async (context) => {
    try {
      const body = profileGenerationSchema.parse(await context.req.json());
      return context.json(await generator.generate(body));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.get("/profile-runs/:runId", async (context) => {
    const summary = await getProfileRunSummary(options.store, context.req.param("runId"));
    if (!summary) {
      return context.json({ error: { code: "not_found", message: "Profile generation run was not found." } }, 404);
    }

    return context.json(summary);
  });

  routes.post("/import/github", async (context) => {
    try {
      const body = importGitHubSchema.parse(await context.req.json());
      const handle = parseGitHubProfileUrl(body.input);
      const generated = await generateFromCandidate({
        id: `github-import:${handle.toLowerCase()}`,
        displayName: handle,
        handle,
        sourceType: "github",
        sourceId: handle,
        sourceUrl: `https://github.com/${handle}`,
        confidence: 0.96,
        evidencePreview: [{
          id: `https://github.com/${handle}`,
          type: "external",
          title: `GitHub profile ${handle}`,
          url: `https://github.com/${handle}`,
          reason: "Direct GitHub source provided."
        }],
        reasons: ["Direct GitHub source provided."],
        warnings: []
      }, body.input, generator, llmClient);

      return context.json({
        handle: generated.handle,
        status: generated.status,
        cardCount: generated.cardsGenerated,
        artifactCount: generated.artifactsImported,
        warnings: generated.warnings,
        recoveryAdvice: githubImportRecoveryAdvice(generated.warnings),
        workspaceUrl: `/u/${generated.handle}/workspace`,
        profileUrl: generated.profileUrl
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/website", async (context) => {
    try {
      const body = importWebsiteSchema.parse(await context.req.json());
      return context.json(await appendViaGenerator(generator, options.store, body.handle, { type: "website", input: body.url }));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/openalex", async (context) => {
    try {
      const body = importForHandleSchema.parse(await context.req.json());
      return context.json(await appendViaGenerator(generator, options.store, body.handle, { type: "openalex", input: body.input }));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/arxiv", async (context) => {
    try {
      const body = importForHandleSchema.parse(await context.req.json());
      return context.json(await appendViaGenerator(generator, options.store, body.handle, { type: "arxiv", input: body.input }));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/orcid", async (context) => {
    try {
      const body = importForHandleSchema.parse(await context.req.json());
      return context.json(await appendViaGenerator(generator, options.store, body.handle, { type: "orcid", input: body.input }));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.get("/people/:handle", async (context) => {
    const profile = await options.store.getProfile(context.req.param("handle"));

    if (!profile) {
      return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
    }

    return context.json(toPublicProfile(profile));
  });

  routes.get("/people/:handle/workspace", async (context) => {
    const handle = context.req.param("handle");
    const profile = await options.store.getProfile(handle);

    if (!profile) {
      return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
    }

    const profileSources = await options.store.listProfileSourcesForHandle(handle);
    return context.json({
      profile: toWorkspaceProfile(profile),
      publicProfile: toPublicProfile(profile),
      profileSources: profileSources.map(sanitizeProfileSourceRun),
      readiness: profileReadiness(profile),
      discoverQuery: workspaceDiscoverQuery(profile)
    });
  });

  routes.get("/search", async (context) => {
    try {
      const query = z.string().min(1).parse(context.req.query("q"));
      const profiles = await options.store.listProfiles();
      const documents: PersonSearchDocument[] = profiles
        .map((profile) => toPublicProfile(profile))
        .map((profile) => ({
          person: profile.person,
          artifacts: profile.artifacts,
          cards: profile.cards,
          claims: profile.claims
        }));

      return context.json({
        query,
        results: await hybridSearchPeople(query, documents)
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.get("/cards/:handle", async (context) => {
    const handle = context.req.param("handle");
    const cards = await options.store.listCards(handle);

    if (!cards) {
      return context.json({ error: { code: "not_found", message: "Cards were not found." } }, 404);
    }

    return context.json({ handle, cards: publicCards(cards) });
  });

  routes.get("/people/:handle/cards", async (context) => {
    const handle = context.req.param("handle");
    const cards = await options.store.listCards(handle);

    if (!cards) {
      return context.json({ error: { code: "not_found", message: "Cards were not found." } }, 404);
    }

    return context.json({ handle, cards: publicCards(cards) });
  });

  routes.get("/people/:handle/claims", async (context) => {
    const handle = context.req.param("handle");
    const profile = await options.store.getProfile(handle);
    if (!profile) {
      return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
    }

    return context.json({ handle, claims: approvedClaims(profile) });
  });

  routes.patch("/claims/:claimId", async (context) => {
    try {
      const body = patchClaimSchema.parse(await context.req.json());
      const claim = await options.store.updateClaim(context.req.param("claimId"), body);
      if (!claim) {
        return context.json({ error: { code: "not_found", message: "Claim was not found." } }, 404);
      }

      return context.json({ claim });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.patch("/cards/:cardId", async (context) => {
    try {
      const body = patchCardSchema.parse(await context.req.json());
      const card = await options.store.updateCard(context.req.param("cardId"), body);
      if (!card) {
        return context.json({ error: { code: "not_found", message: "Card was not found." } }, 404);
      }

      return context.json({ card });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/cards/:cardId/regenerate", async (context) => {
    const cardId = context.req.param("cardId");
    const profiles = await options.store.listProfiles();
    const profile = profiles.find((item) => item.cards.some((card) => card.id === cardId));
    const existingCard = profile?.cards.find((card) => card.id === cardId);
    if (!profile || !existingCard) {
      return context.json({ error: { code: "not_found", message: "Card was not found." } }, 404);
    }

    const regenerated = generateProfileCards(profile.person, profile.artifacts, approvedClaims(profile) as CardClaim[])
      .find((card) => card.type === existingCard.type);
    if (!regenerated) {
      return context.json({ error: { code: "not_found", message: "No supported regeneration source was found for this card." } }, 404);
    }

    const card = await options.store.updateCard(cardId, {
      title: regenerated.title,
      contentMd: regenerated.contentMd,
      dataJson: regenerated.dataJson,
      evidence: regenerated.evidence,
      claimIds: regenerated.claimIds,
      sourceIds: regenerated.sourceIds,
      confidence: regenerated.confidence
    });
    if (!card) {
      return context.json({ error: { code: "not_found", message: "Card was not found." } }, 404);
    }

    return context.json({ card });
  });

  routes.patch("/people/:handle/publish", async (context) => {
    try {
      const handle = context.req.param("handle");
      const body = publishProfileSchema.parse(await context.req.json());
      const profile = await options.store.publishProfile(handle, body.publicStatus);
      if (!profile) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json({ profile: toPublicProfile(profile) });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/cards/:handle/note", async (context) => {
    try {
      const handle = context.req.param("handle");
      const body = createNoteCardSchema.parse(await context.req.json());
      const card = await createManualNoteCard(options.store, handle, body.title, body.contentMd);

      if (!card) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json({ handle, card }, 201);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/people/:handle/cards/manual-note", async (context) => {
    try {
      const handle = context.req.param("handle");
      const body = createNoteCardSchema.parse(await context.req.json());
      const card = await createManualNoteCard(options.store, handle, body.title, body.contentMd);

      if (!card) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json({ handle, card }, 201);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/people/:handle/artifacts", async (context) => {
    try {
      const artifact = manualArtifactSchema.parse(await context.req.json());
      const summary = await appendViaGenerator(generator, options.store, context.req.param("handle"), {
        type: "manual",
        input: {
          title: artifact.title,
          url: artifact.url,
          description: artifact.description
        }
      });

      return context.json(summary, 201);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/seed/demo", async (context) => {
    const profiles = createDemoProfiles();
    await Promise.all(profiles.map((profile) => options.store.upsertProfile(profile)));

    return context.json({
      profileCount: profiles.length,
      handles: profiles.map((profile) => profile.person.handle)
    });
  });

  return routes;
}

function getConfiguredLlmClient(options: ApiRouteOptions): JsonLlmClient | undefined {
  if (options.llmClient) {
    return options.llmClient;
  }
  const config = getLlmGenerationConfig();
  return config ? createOpenAICompatibleJsonClient({ ...config, fetchImpl: options.fetchImpl }) : undefined;
}

function createCandidateResolver(store: OpenDinqStore, fetchImpl?: typeof fetch): ProfileCandidateResolver {
  return new ProfileCandidateResolver({ store, fetchImpl, githubToken: process.env.GITHUB_TOKEN || undefined });
}

function usedLocalFallback(warnings: string[]): boolean {
  return warnings.some((warning) => warning.includes("using local fallback planning"));
}

async function runAgentSearch(
  input: string,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient | undefined;
    fetchImpl?: typeof fetch;
  }
) {
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
  let profile: ReturnType<typeof toPublicProfile> | undefined;
  let cards: CardRecord[] | undefined;
  let search: Awaited<ReturnType<typeof hybridSearchPeople>> | undefined;
  let selectedCandidate: ProfileCandidate | undefined;
  let webEvidence: AgentWebEvidence[] = [];
  const warnings: string[] = [...toolPlan.warnings];

  for (const call of toolCalls) {
    const result = await executeAgentToolCallSafely(input, call, {
      store: options.store,
      generator: options.generator,
      llmClient: options.llmClient,
      fetchImpl: options.fetchImpl,
      latestHandle: generated?.handle ?? profile?.person.handle,
      selectedCandidate,
      webEvidence
    });
    researchSteps.push(buildAgentResearchStep(call.tool, result));
    toolResults.push({ tool: call.tool, result: summarizeAgentToolResult(result) });
    if (isCandidateResolutionResult(result)) {
      selectedCandidate = result.selectedCandidate;
      if (!selectedCandidate && result.candidates.length === 0 && result.queryType === "role_search") {
        return {
          ...result,
          status: "needs_public_source",
          llmUsed: true,
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
          llmUsed: true,
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
    generated = await generateFromCandidate(selectedCandidate, input, options.generator, options.llmClient);
    warnings.push("Agent tool plan stopped before generation; OpenDinq generated the selected public candidate.");
  }

  if (generated && !profile) {
    const saved = await options.store.getProfile(generated.handle);
    profile = saved ? toPublicProfile(saved) : undefined;
  }
  if (generated && !cards) {
    cards = publicCards(await options.store.listCards(generated.handle) ?? []);
  }
  if (generated && !search) {
    search = profile ? await searchProfiles(input, [profile]) : [];
  }
  const manualOnly = generated?.plan ? isManualOnlyPlan(generated.plan) : false;
  if (manualOnly) {
    warnings.push("No verified public source was found for this request. Review workspace was created, but profile cards are based only on user-provided text.");
    search = profile ? await searchProfiles(input, [profile]) : [];
  }
  const usedAgent = toolCalls.length > 0;
  const usedLlm = usedAgent && toolCalls.some((call) => call.tool === "opendinq_plan_profile_generation" || call.tool === "opendinq_generate_profile_ai");

  return {
    runId: generated?.runId,
    handle: generated?.handle ?? profile?.person.handle,
    status: manualOnly ? "needs_public_source" : generated?.status ?? (profile ? "completed" : "needs_review"),
    profileUrl: generated?.profileUrl ?? (profile ? `/u/${profile.person.handle}` : undefined),
    workspaceUrl: generated?.workspaceUrl ?? (profile ? `/u/${profile.person.handle}/workspace` : undefined),
    cardsGenerated: generated?.cardsGenerated ?? cards?.length ?? 0,
    artifactsImported: generated?.artifactsImported ?? profile?.artifacts.length ?? 0,
    claimsGenerated: generated?.claimsGenerated ?? profile?.claims?.length ?? 0,
    llmUsed: usedLlm,
    agentUsed: usedAgent,
    toolCalls,
    toolResults,
    researchSteps,
    profile,
    cards,
    searchResults: search,
    warnings: [...new Set([...(generated?.warnings ?? []), ...warnings])],
    recoveryAdvice: githubImportRecoveryAdvice([...(generated?.warnings ?? []), ...warnings])
  };
}

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
  }
) {
  const resolution = await createCandidateResolver(options.store, options.fetchImpl).resolve(input);
  if (resolution.autoSelectedCandidateId) {
    const candidate = resolution.candidates.find((item) => item.id === resolution.autoSelectedCandidateId);
    if (candidate) {
      const generated = await generateFromCandidate(candidate, input, options.generator, options.llmClient);
      const profile = await options.store.getProfile(generated.handle);
      return {
        ...generated,
        profile: profile ? toPublicProfile(profile) : undefined,
        cards: publicCards(await options.store.listCards(generated.handle) ?? []),
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
  return isHttpUrlInput(trimmed)
    || /https?:\/\/\S+/i.test(trimmed)
    || /\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/i.test(trimmed)
    || /\b\d{4}\.\d{4,5}(?:v\d+)?\b/i.test(trimmed)
    || /\bA\d{4,}\b/i.test(trimmed)
    || /(?:github\.com\/|github\s+(?:user|profile|handle)?\s*[:=]?\s*|(?:^|\s)@[A-Za-z0-9][A-Za-z0-9-]{1,38}(?:\s|$))/i.test(trimmed);
}

function canUseDeterministicAgentFallback(input: string): boolean {
  const trimmed = input.trim();
  return (
    isHttpUrlInput(trimmed) ||
    /^[A-Za-z0-9-]{2,39}$/.test(trimmed) && !/^[A-Z]\d+$/i.test(trimmed) ||
    /^A\d{4,}$/i.test(trimmed) ||
    /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(trimmed) ||
    /^\d{4}\.\d{4,5}(v\d+)?$/i.test(trimmed) ||
    deterministicAgentQueryTerms(trimmed).length > 0
  );
}

function isHttpUrlInput(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

async function planAgentToolCallsSafely(input: string, client: JsonLlmClient): Promise<{ toolCalls: AgentToolCall[]; warnings: string[] }> {
  try {
    return {
      toolCalls: await withTimeout(planAgentToolCalls(input, client), agentPlanningTimeoutMs(), "Agent tool planning timed out."),
      warnings: []
    };
  } catch (error) {
    if (isLlmRuntimeError(error)) {
      return {
        toolCalls: defaultAgentToolPlan(input),
        warnings: [`Agent tool planning failed because the LLM request did not complete: ${error instanceof Error ? error.message : "request failed"}`]
      };
    }
    throw error;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
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
  }
): Promise<unknown> {
  if (call.tool === "opendinq_web_search") {
    const query = stringValue(call.input.query) ?? stringValue(call.input.input) ?? originalInput;
    return searchPublicWebEvidence(query, {
      fetchImpl: options.fetchImpl,
      selectedCandidate: options.selectedCandidate
    });
  }
  if (call.tool === "opendinq_resolve_profile_candidates") {
    const query = stringValue(call.input.query) ?? stringValue(call.input.input) ?? originalInput;
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
    const input = stringValue(call.input.input) ?? originalInput;
    return { plan: await enrichPlanWithDiscoveredSources(await planProfileGeneration(input, { client: options.llmClient }), options.fetchImpl), llmUsed: true };
  }
  if (call.tool === "opendinq_generate_profile_ai") {
    const input = stringValue(call.input.input) ?? originalInput;
    if (options.selectedCandidate && options.selectedCandidate.sourceType !== "manual") {
      const candidate = withWebEvidenceSources(options.selectedCandidate, options.webEvidence ?? []);
      const generated = await generateFromCandidate(candidate, input, options.generator, options.llmClient);
      return {
        ...generated,
        warnings: [
          `OpenDinq selected a public ${options.selectedCandidate.sourceType} candidate before generation.`,
          ...mergeGenerationWarnings(generated.plan, [], generated.warnings)
        ]
      };
    }
    const basePlan = await planProfileGeneration(input, { client: options.llmClient });
    const plan = await enrichPlanWithDiscoveredSources(basePlan, options.fetchImpl);
    if (isManualOnlyPlan(basePlan) && !isManualOnlyPlan(plan) && !options.selectedCandidate) {
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
      synthesizeClaims: async ({ person, bundles, artifacts, deterministicClaims }) => synthesizeProfileClaims(options.llmClient, plan, person, bundles, artifacts, deterministicClaims)
    });
    const generated = await aiGenerator.generate(planToGenerationInput(plan));
    return {
      ...generated,
      workspaceUrl: `/u/${generated.handle}/workspace`,
      llmUsed: true,
      plan,
      warnings: mergeGenerationWarnings(plan, plan.warnings, generated.warnings),
      recoveryAdvice: githubImportRecoveryAdvice(mergeGenerationWarnings(plan, plan.warnings, generated.warnings))
    };
  }
  if (call.tool === "opendinq_get_profile") {
    const handle = toolHandleValue(call.input.handle, options.latestHandle);
    if (!handle) {
      return { warnings: ["opendinq_get_profile skipped because no handle was available."] };
    }
    const profile = await options.store.getProfile(handle);
    return profile ? toPublicProfile(profile) : { warnings: [`Profile ${handle} was not found.`] };
  }
  if (call.tool === "opendinq_list_cards") {
    const handle = toolHandleValue(call.input.handle, options.latestHandle);
    if (!handle) {
      return { warnings: ["opendinq_list_cards skipped because no handle was available."] };
    }
    return { handle, cards: publicCards(await options.store.listCards(handle) ?? []) };
  }
  const query = stringValue(call.input.query) ?? originalInput;
  return { query, results: await searchProfiles(query, await options.store.listProfiles()) };
}

function toolHandleValue(value: unknown, latestHandle: string | undefined): string | undefined {
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

async function searchPublicWebEvidence(
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
    if (!url || !isHttpUrlInput(url)) {
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
  if (selectedCandidate?.sourceUrl && isHttpUrlInput(selectedCandidate.sourceUrl)) {
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

function compactIdentifier(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function resolveManualOnlyPlanCandidate(
  plan: ProfileGenerationPlan,
  input: string,
  options: {
    store: OpenDinqStore;
    generator: ReturnType<typeof createProfileGenerator>;
    llmClient: JsonLlmClient;
    fetchImpl?: typeof fetch;
  }
) {
  if (!isManualOnlyPlan(plan)) {
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
      const generated = await generateFromCandidate(candidate, input, options.generator, options.llmClient);
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

async function searchProfiles(query: string, profiles: PersonProfileRecord[]) {
  const documents: PersonSearchDocument[] = profiles.map((profile) => toPublicProfile(profile)).map((profile) => ({
    person: profile.person,
    artifacts: profile.artifacts,
    cards: profile.cards,
    claims: profile.claims
  }));
  return hybridSearchPeople(query, documents);
}

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

function isPublicProfileResult(value: unknown): value is ReturnType<typeof toPublicProfile> {
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

function githubImportRecoveryAdvice(warnings: string[]): ImportRecoveryAdvice | undefined {
  if (!warnings.some((warning) => /github .*rate limit|github .*api limit|github anonymous api limit/i.test(warning))) {
    return undefined;
  }

  return {
    kind: "github_token_setup",
    title: "Add a GitHub token for stronger imports",
    message: "GitHub's anonymous API limit reduced import completeness, so OpenDinq continued with public web evidence and created a reviewable result.",
    actionLabel: "Improve local GitHub imports with GITHUB_TOKEN",
    actionCommand: "GITHUB_TOKEN=YOUR_TOKEN pnpm dev"
  };
}

async function generateFromCandidate(
  candidate: ProfileCandidate,
  rawInput: string,
  generator: ReturnType<typeof createProfileGenerator>,
  llmClient: JsonLlmClient | undefined
): Promise<Awaited<ReturnType<ReturnType<typeof createProfileGenerator>["generate"]>> & { workspaceUrl?: string; llmUsed?: boolean; plan?: ProfileGenerationPlan; recoveryAdvice?: ImportRecoveryAdvice }> {
  if (candidate.sourceType === "existing_profile" && candidate.handle) {
    return {
      runId: `existing-${candidate.handle}`,
      handle: candidate.handle,
      status: "completed",
      profileUrl: `/u/${candidate.handle}`,
      workspaceUrl: `/u/${candidate.handle}/workspace`,
      cardsGenerated: 0,
      artifactsImported: candidate.evidencePreview.length,
      claimsGenerated: 0,
      llmUsed: false,
      warnings: candidate.warnings
    };
  }

  const plan = candidateToPlan(candidate, rawInput);
  const generated = await generator.generate(planToGenerationInput(plan));
  return {
    ...generated,
    workspaceUrl: `/u/${generated.handle}/workspace`,
    llmUsed: false,
    plan,
    warnings: [...new Set([...candidate.warnings, ...generated.warnings])],
    recoveryAdvice: githubImportRecoveryAdvice([...candidate.warnings, ...generated.warnings])
  };
}

function candidateToPlan(candidate: ProfileCandidate, rawInput: string): ProfileGenerationPlan {
  const sources = candidateSources(candidate);
  return {
    rawInput,
    intent: sources.every((source) => source.type === "manual") ? "manual_profile" : "generate_profile",
    confidence: candidate.confidence,
    subject: {
      displayName: candidate.displayName,
      handle: candidate.handle,
      headline: candidate.headline
    },
    sources,
    userProvidedClaims: sources.every((source) => source.type === "manual") ? [{ text: rawInput, type: "summary", confidence: 0.45, evidenceStatus: "user_provided" }] : [],
    missingEvidence: [],
    questions: [],
    warnings: candidate.warnings
  };
}

function candidateSources(candidate: ProfileCandidate): ProfileGenerationPlan["sources"] {
  const clusterSources = candidate.sources?.length
    ? candidate.sources
    : [{
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      sourceUrl: candidate.sourceUrl,
      confidence: candidate.confidence,
      evidencePreview: candidate.evidencePreview,
      reasons: candidate.reasons,
      warnings: candidate.warnings
    }];
  const publicClusterSources = clusterSources.filter((source) => source.sourceType !== "existing_profile" && source.sourceType !== "manual");
  const selectedSources = publicClusterSources.length > 0 ? publicClusterSources : clusterSources;
  const sources = selectedSources.map((source) => candidateSource({
      displayName: candidate.displayName,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceUrl: source.sourceUrl,
      confidence: source.confidence,
      evidencePreview: source.evidencePreview,
      reasons: source.reasons,
      warnings: source.warnings
    } as ProfileCandidate));
  return dedupePlanSources([...sources, ...agentWebEvidenceSources(candidate)]);
}

function candidateSource(candidate: ProfileCandidate): ProfileGenerationPlan["sources"][number] {
  if (candidate.sourceType === "github") {
    return { type: "github", input: candidate.sourceId ?? candidate.handle ?? candidate.sourceUrl ?? candidate.displayName, confidence: candidate.confidence, reason: candidate.reasons[0] ?? "Candidate selected for generation.", evidenceStatus: "explicit" };
  }
  if (candidate.sourceType === "website" || candidate.sourceType === "web") {
    return { type: "website", input: candidate.sourceUrl ?? candidate.sourceId ?? candidate.displayName, confidence: candidate.confidence, reason: candidate.reasons[0] ?? "Candidate selected for generation.", evidenceStatus: "explicit" };
  }
  if (candidate.sourceType === "openalex" || candidate.sourceType === "orcid" || candidate.sourceType === "arxiv") {
    return { type: candidate.sourceType, input: candidate.sourceId ?? candidate.sourceUrl ?? candidate.displayName, confidence: candidate.confidence, reason: candidate.reasons[0] ?? "Candidate selected for generation.", evidenceStatus: candidate.confidence >= 0.9 ? "explicit" : "inferred" };
  }
  return { type: "manual", input: { title: `${candidate.displayName} profile request`, note: candidate.displayName, description: candidate.reasons.join(" ") }, confidence: candidate.confidence, reason: "No public candidate source was selected.", evidenceStatus: "user_provided" };
}

function agentWebEvidenceSources(candidate: ProfileCandidate): ProfileGenerationPlan["sources"] {
  if (candidate.sourceType === "github" && candidate.sourceUrl) {
    return [{
      type: "website",
      input: candidate.sourceUrl,
      confidence: 0.82,
      reason: "Public profile page is used as web evidence when API import is limited.",
      evidenceStatus: "explicit"
    }];
  }
  return [];
}

function dedupePlanSources(sources: ProfileGenerationPlan["sources"]): ProfileGenerationPlan["sources"] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.type}:${typeof source.input === "string" ? source.input : JSON.stringify(source.input)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeGenerationWarnings(plan: ProfileGenerationPlan | undefined, planWarnings: string[], generatedWarnings: string[]): string[] {
  const hasPublicSource = plan?.sources.some((source) => source.type !== "manual") ?? false;
  return [...new Set([...planWarnings, ...generatedWarnings])]
    .filter((warning) => !(hasPublicSource && warning.includes("This profile was generated from user-provided information")));
}

function isManualOnlyPlan(plan: ProfileGenerationPlan): boolean {
  return !plan.sources.some((source) => source.type !== "manual" && (source.evidenceStatus === "explicit" || source.evidenceStatus === "inferred"));
}

async function enrichPlanWithDiscoveredSources(plan: ProfileGenerationPlan, fetchImpl?: typeof fetch): Promise<ProfileGenerationPlan> {
  if (plan.sources.some((source) => source.evidenceStatus === "explicit" && source.type !== "manual")) {
    return plan;
  }

  const query = plan.subject.displayName ?? personLikeInput(plan.rawInput);
  if (!query) {
    return plan;
  }

  try {
    const authors = await searchOpenAlexAuthors(query, { fetchImpl });
    const candidate = bestOpenAlexCandidate(query, authors);
    if (!candidate) {
      return plan;
    }

    return {
      ...plan,
      sources: [
        {
          type: "openalex",
          input: candidate.id,
          confidence: 0.72,
          reason: `OpenDinq found a public OpenAlex author candidate for "${query}".`,
          evidenceStatus: "inferred"
        },
        ...plan.sources
      ],
      warnings: [
        `OpenDinq found an OpenAlex candidate for "${query}". Review the imported evidence before publishing.`,
        ...plan.warnings.filter((warning) => !warning.includes("No public source URL or id was provided"))
      ]
    };
  } catch {
    return plan;
  }
}

function bestOpenAlexCandidate(query: string, authors: Awaited<ReturnType<typeof searchOpenAlexAuthors>>) {
  const normalizedQuery = query.trim().toLowerCase();
  const exact = authors.filter((author) => author.display_name.trim().toLowerCase() === normalizedQuery);
  const candidates = exact.length > 0 ? exact : authors;
  return candidates
    .filter((author) => author.id && author.display_name)
    .toSorted((left, right) => (right.cited_by_count ?? 0) - (left.cited_by_count ?? 0) || (right.works_count ?? 0) - (left.works_count ?? 0))[0];
}

function personLikeInput(input: string): string | undefined {
  const normalized = input.replace(/^generate a profile (for|from)\s+/i, "").trim();
  return /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(normalized) ? normalized : undefined;
}

function descriptiveEnough(input: string): boolean {
  return input.trim().split(/\s+/).length >= 3;
}

function titleFromInput(input: string): string {
  const words = input.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Review Profile";
}

function slugFromInput(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "review-profile";
}

function planToGenerationInput(plan: ProfileGenerationPlan): z.infer<typeof profileGenerationSchema> {
  const displayName = planDisplayName(plan);
  const sources = plan.sources.map((source) => {
    if (source.type === "manual") {
      const input = typeof source.input === "string" ? { note: source.input } : source.input;
      return {
        type: "manual" as const,
        input: {
          title: stringValue(input.title) ?? displayName ?? "Manual profile evidence",
          url: stringValue(input.url),
          note: stringValue(input.note) ?? stringValue(input.text) ?? plan.rawInput,
          description: stringValue(input.description) ?? "User-provided information. This is not verified public evidence."
        }
      };
    }
    return {
      type: source.type,
      input: String(source.input)
    } as z.infer<typeof profileGenerationSchema>["sources"][number];
  });

  for (const claim of plan.userProvidedClaims) {
    if (!sources.some((source) => source.type === "manual" && source.input.note === claim.text)) {
      sources.push({
        type: "manual",
        input: {
          title: displayName ? `${displayName} user-provided claim` : "User-provided claim",
          note: claim.text,
          description: "User-provided claim. Add public evidence before treating it as verified."
        }
      });
    }
  }

  if (sources.length === 0) {
    sources.push({
      type: "manual",
      input: {
        title: displayName ? `${displayName} profile request` : "Manual profile request",
        note: plan.rawInput,
        description: plan.missingEvidence.map((item) => `${item.need}: ${item.reason}`).join(" ") || "Review workspace created without verified public evidence."
      }
    });
  }

  return {
    displayName,
    handle: plan.subject.handle,
    headline: plan.subject.headline,
    sources
  };
}

function planDisplayName(plan: ProfileGenerationPlan): string | undefined {
  const displayName = stringValue(plan.subject.displayName)?.trim();
  if (!displayName) {
    return undefined;
  }
  const handle = stringValue(plan.subject.handle)?.trim();
  if (handle && compactIdentifier(displayName) === compactIdentifier(handle)) {
    return undefined;
  }
  return displayName;
}

async function synthesizeProfileClaims(
  client: JsonLlmClient,
  plan: ProfileGenerationPlan,
  person: PersonProfileRecord["person"],
  bundles: Array<{ source: unknown }>,
  artifacts: ArtifactRecord[],
  deterministicClaims: ProfileClaimRecord[]
): Promise<ProfileClaimRecord[]> {
  if (artifacts.length === 0 || artifacts.every((artifact) => artifact.metadata?.source === "opendinq-review" || artifact.metadata?.evidenceStatus === "user_provided")) {
    return deterministicClaims;
  }

  const claims = await synthesizeClaimsWithEvidence({
    inferredPerson: { ...person, ...plan.subject },
    sources: bundles.map((bundle) => bundle.source),
    artifacts,
    deterministicClaims: deterministicClaims.map(toSynthesisClaim)
  }, client);
  return claims.map(fromSynthesisClaim);
}

function toSynthesisClaim(claim: ProfileClaimRecord): SynthesisClaim {
  return {
    id: claim.id,
    type: claim.type,
    text: claim.text,
    confidence: claim.confidence,
    evidence: claim.evidence
  };
}

function fromSynthesisClaim(claim: SynthesisClaim): ProfileClaimRecord {
  return {
    id: claim.id,
    type: claim.type,
    text: claim.text,
    confidence: claim.confidence,
    evidence: claim.evidence as EvidenceRecord[],
    status: "approved"
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function appendViaGenerator(
  generator: ReturnType<typeof createProfileGenerator>,
  store: OpenDinqStore,
  handle: string,
  source: z.infer<typeof profileGenerationSchema>["sources"][number]
) {
  const existing = await store.getProfile(handle);
  if (!existing) {
    throw new ApiNotFoundError("Person was not found.");
  }

  const summary = await generator.generate({
    displayName: existing.person.displayName,
    handle,
    headline: existing.person.headline,
    sources: [source]
  });
  const profile = await store.getProfile(handle);
  return profile ? importSummary(profile) : summary;
}

function importSummary(profile: PersonProfileRecord) {
  return {
    handle: profile.person.handle,
    sourceCount: profile.sources.length,
    artifactCount: profile.artifacts.length,
    cardCount: profile.cards.length
  };
}

function toPublicProfile(profile: PersonProfileRecord): PersonProfileRecord {
  return {
    person: profile.person,
    sources: profile.sources.map(sanitizeIdentitySource),
    artifacts: profile.artifacts.map(sanitizeArtifact),
    cards: publicCards(profile.cards),
    claims: sanitizeClaims(approvedClaims(profile))
  };
}

function toWorkspaceProfile(profile: PersonProfileRecord): PersonProfileRecord {
  return {
    person: profile.person,
    sources: profile.sources.map(sanitizeIdentitySource),
    artifacts: profile.artifacts.map(sanitizeArtifact),
    cards: profile.cards.map(sanitizeCard),
    claims: sanitizeClaims(profile.claims ?? [])
  };
}

function publicCards(cards: CardRecord[]): CardRecord[] {
  return cards
    .filter((card) => card.visibility === undefined || card.visibility === "public")
    .map(sanitizeCard)
    .toSorted((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.type.localeCompare(right.type) || left.title.localeCompare(right.title));
}

function sanitizeIdentitySource(source: IdentitySourceRecord): IdentitySourceRecord {
  return {
    id: source.id,
    type: source.type,
    url: source.url,
    externalId: source.externalId
  };
}

function sanitizeArtifact(artifact: ArtifactRecord): ArtifactRecord {
  return {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    description: artifact.description,
    url: artifact.url,
    metadata: sanitizePublicJsonRecord(artifact.metadata)
  };
}

function sanitizeCard(card: CardRecord): CardRecord {
  return {
    id: card.id,
    personId: card.personId,
    type: card.type,
    title: card.title,
    contentMd: card.contentMd,
    dataJson: sanitizePublicJsonRecord(card.dataJson),
    evidence: card.evidence,
    sourceIds: card.sourceIds,
    claimIds: card.claimIds,
    confidence: card.confidence,
    visibility: card.visibility,
    order: card.order,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt
  };
}

function sanitizeClaim(claim: ProfileClaimRecord): ProfileClaimRecord {
  return {
    id: claim.id,
    personId: claim.personId,
    sourceId: claim.sourceId,
    artifactId: claim.artifactId,
    type: claim.type,
    text: claim.text,
    confidence: claim.confidence,
    qualityScore: claim.qualityScore,
    evidence: claim.evidence,
    status: claim.status
  };
}

function sanitizeClaims(claims: ProfileClaimRecord[]): ProfileClaimRecord[] {
  const usedIds = new Set<string>();
  return claims.map((claim, index) => {
    const sanitized = sanitizeClaim(claim);
    if (!sanitized.id) {
      const fallbackId = `claim-${sanitized.personId ?? "profile"}-${index}`;
      usedIds.add(fallbackId);
      return { ...sanitized, id: fallbackId };
    }
    if (!usedIds.has(sanitized.id)) {
      usedIds.add(sanitized.id);
      return sanitized;
    }
    let dedupedId = `${sanitized.id}-${index}`;
    while (usedIds.has(dedupedId)) {
      dedupedId = `${sanitized.id}-${index}-${usedIds.size}`;
    }
    usedIds.add(dedupedId);
    return { ...sanitized, id: dedupedId };
  });
}

function sanitizeProfileSourceRun(source: ProfileSourceRecord): ProfileSourceRecord {
  return {
    id: source.id,
    personId: source.personId,
    runId: source.runId,
    type: source.type,
    url: source.url,
    status: source.status,
    warnings: source.warnings
  };
}

function sanitizePublicJsonRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const sanitized = sanitizePublicJsonValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized as Record<string, unknown> : undefined;
}

function sanitizePublicJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizePublicJsonValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !["rawJson", "normalizedJson", "evidenceRaw", "attemptedSources"].includes(key))
    .map(([key, nestedValue]) => [key, sanitizePublicJsonValue(nestedValue)]));
}

async function createManualNoteCard(store: OpenDinqStore, handle: string, title: string, contentMd: string): Promise<CardRecord | undefined> {
  const noteId = `manual-note-${handle}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return store.saveCard(handle, {
    id: `card-${noteId}`,
    personId: handle,
    type: "note",
    title,
    contentMd,
    dataJson: {
      source: "manual"
    },
    evidence: [
      {
        id: noteId,
        type: "external",
        title,
        reason: "Manual note supplied through the OpenDinq API."
      }
    ],
    visibility: "public",
    order: 60
  });
}

function approvedClaims(profile: PersonProfileRecord): ProfileClaimRecord[] {
  return publicRankedClaims(profile.claims ?? []);
}

function profileReadiness(profile: PersonProfileRecord) {
  const claims = profile.claims ?? [];
  const visibleCards = publicCards(profile.cards);
  const approved = approvedClaims(profile);
  const hasKeyProfileCards = visibleCards.length >= 3 || (
    visibleCards.some((card) => card.type === "summary") &&
    visibleCards.some((card) => card.type === "works")
  );
  const checks = [
    { label: "Add a public source", complete: profile.sources.length > 0 },
    { label: "Review highlighted details", complete: claims.length > 0 && claims.every((claim) => claim.status && claim.status !== "pending") },
    { label: "Show key profile cards", complete: hasKeyProfileCards },
    { label: "Add a clear headline", complete: Boolean(profile.person.headline) },
    { label: "Add a profile note", complete: profile.cards.some((card) => card.type === "note") },
    { label: "Attach supporting evidence", complete: approved.some((claim) => claim.evidence.length > 0) && visibleCards.some((card) => card.evidence.length > 0) }
  ];
  const score = Math.round((checks.filter((check) => check.complete).length / checks.length) * 100);
  return { score, checks };
}

function workspaceDiscoverQuery(profile: PersonProfileRecord): string {
  const headline = profile.person.headline?.trim();
  const headlineTerms = new Set((headline ?? "").toLowerCase().split(/[^a-z0-9#+.-]+/).filter(Boolean));
  const seenSkills = new Set<string>();
  const skills = approvedClaims(profile)
    .filter((claim) => claim.type === "skill")
    .map((claim) => claim.text.trim())
    .filter(Boolean)
    .filter((skill) => {
      const normalizedSkill = skill.toLowerCase();
      if (seenSkills.has(normalizedSkill)) {
        return false;
      }
      seenSkills.add(normalizedSkill);
      return !headlineTerms.has(normalizedSkill);
    })
    .slice(0, 3);
  return [headline, ...skills].filter(Boolean).join(" ") || profile.person.displayName;
}
