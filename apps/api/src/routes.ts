import { generateCandidateInsights, generateProfileCards, generateSearchMatchCard, type CardClaim } from "@opendinq/cards";
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
import { hybridSearchPeople, applySearchFilters, collectFacets, type PersonSearchDocument, type SearchFilters } from "@opendinq/search";
import { Hono } from "hono";
import { z } from "zod";
import { createDemoProfiles } from "./demo-data.js";
import { ApiNotFoundError, errorResponse } from "./errors.js";
import { ProfileCandidateResolver, type ProfileCandidate } from "./profile-candidate-resolver.js";
import { createProfileGenerator, getProfileRunSummary, type ProfileGenerationSummary } from "./profile-generator.js";
import { compactIdentifier, isHttpUrl, personLikeInput, withTimeout } from "./utils.js";
import { runAgentSearch, runAgentSearchStreamed, searchPublicWebEvidence, type AgentToolCall, type AgentToolResult, type AgentWebEvidence, type AgentResearchStep, type AgentSearchHelpers } from "./agent-search.js";

const agentSearchSchema = z.object({
  input: z.string().min(1)
});

const webSearchSchema = z.object({
  query: z.string().min(1).optional(),
  input: z.string().min(1).optional()
}).refine((value) => value.query || value.input, { message: "query or input is required" });

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
  const agentSearchHelpers: AgentSearchHelpers = {
    toPublicProfile,
    publicCards,
    generateFromCandidate,
    planToGenerationInput,
    isManualOnlyPlan,
    enrichPlanWithDiscoveredSources,
    mergeGenerationWarnings,
    synthesizeProfileClaims,
    stringValue,
    githubImportRecoveryAdvice,

  };

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
        fetchImpl: options.fetchImpl,
        helpers: agentSearchHelpers
      }));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/agent-search-stream", async (context) => {
    let body: { input: string };
    try {
      body = agentSearchSchema.parse(await context.req.json());
    } catch (error) {
      return errorResponse(context, error);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          await runAgentSearchStreamed(body.input, {
            store: options.store,
            generator,
            llmClient,
            fetchImpl: options.fetchImpl,
            helpers: agentSearchHelpers,
            onStep: (step) => send("step", step),
            onToolCall: (call) => send("tool_call", call),
            onToolResult: (result) => send("tool_result", result)
          }).then((result) => send("complete", result));
        } catch (error) {
          send("error", { message: error instanceof Error ? error.message : "Agent search failed." });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      }
    });
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

    const publicProfile = toPublicProfile(profile);
    const insights = generateCandidateInsights(
      publicProfile.person,
      publicProfile.artifacts,
      (publicProfile.claims ?? []) as Parameters<typeof generateCandidateInsights>[2]
    );

    return context.json({
      ...publicProfile,
      insights
    });
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
      const skillsParam = context.req.query("skills");
      const locationsParam = context.req.query("locations");
      const sourceTypesParam = context.req.query("sourceTypes");
      const minScoreParam = context.req.query("minScore");
      const minArtifactsParam = context.req.query("minArtifacts");

      const filters: SearchFilters = {};
      if (skillsParam) {
        filters.skills = skillsParam.split(",").map((item) => item.trim()).filter(Boolean);
      }
      if (locationsParam) {
        filters.locations = locationsParam.split(",").map((item) => item.trim()).filter(Boolean);
      }
      if (sourceTypesParam) {
        filters.sourceTypes = sourceTypesParam.split(",").map((item) => item.trim()).filter(Boolean);
      }
      if (minScoreParam) {
        const minScore = Number(minScoreParam);
        if (Number.isFinite(minScore)) {
          filters.minScore = minScore;
        }
      }
      if (minArtifactsParam) {
        const minArtifacts = Number(minArtifactsParam);
        if (Number.isFinite(minArtifacts)) {
          filters.minArtifacts = minArtifacts;
        }
      }

      const profiles = await options.store.listProfiles();
      const documents: PersonSearchDocument[] = profiles
        .map((profile) => toPublicProfile(profile))
        .map((profile) => ({
          person: profile.person,
          artifacts: profile.artifacts,
          cards: profile.cards,
          claims: profile.claims
        }));

      const results = await hybridSearchPeople(query, documents);
      const filtered = applySearchFilters(results, filters);
      const facets = collectFacets(documents);

      return context.json({
        query,
        filters,
        facets,
        results: filtered
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
