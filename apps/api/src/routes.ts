import { generateProfileCards, type CardClaim } from "@opendinq/cards";
import { publicRankedClaims } from "@opendinq/core";
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
import { Hono } from "hono";
import { z } from "zod";
import { createDemoProfiles } from "./demo-data.js";
import { errorResponse } from "./errors.js";
import { createProfileGenerator, getProfileRunSummary } from "./profile-generator.js";

export type ApiRouteOptions = {
  store: OpenDinqStore;
  fetchImpl?: typeof fetch;
  llmClient?: JsonLlmClient;
};

const importGitHubSchema = z.object({
  input: z.string().min(1)
});

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
  const generator = createProfileGenerator({
    store: options.store,
    fetchImpl: options.fetchImpl,
    githubToken: process.env.GITHUB_TOKEN || undefined
  });
  const llmClient = getConfiguredLlmClient(options);

  routes.post("/profiles/plan", async (context) => {
    try {
      const body = aiProfileInputSchema.pick({ input: true }).parse(await context.req.json());
      const plan = await planProfileGeneration(body.input, llmClient ? { client: llmClient } : {});
      const warnings = llmClient ? plan.warnings : ["LLM generation is not configured; using deterministic fallback.", ...plan.warnings];
      return context.json({
        plan: { ...plan, warnings },
        llmUsed: Boolean(llmClient),
        warnings
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/profiles/generate-ai", async (context) => {
    try {
      const body = aiProfileInputSchema.parse(await context.req.json());
      const plan = await planProfileGeneration(body.input, llmClient ? { client: llmClient } : {});
      const warnings = llmClient ? [...plan.warnings] : ["LLM generation is not configured; using deterministic fallback.", ...plan.warnings];
      const aiGenerator = createProfileGenerator({
        store: options.store,
        fetchImpl: options.fetchImpl,
        githubToken: process.env.GITHUB_TOKEN || undefined,
        synthesizeClaims: llmClient
          ? async ({ person, bundles, artifacts, deterministicClaims }) => synthesizeProfileClaims(llmClient, plan, person, bundles, artifacts, deterministicClaims)
          : undefined
      });
      const generated = await aiGenerator.generate(planToGenerationInput(plan));

      return context.json({
        ...generated,
        workspaceUrl: `/u/${generated.handle}/workspace`,
        llmUsed: Boolean(llmClient),
        plan,
        warnings: [...new Set([...warnings, ...generated.warnings])]
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
      const generated = await generator.generate({
        sources: [{ type: "github", input: body.input }]
      });

      return context.json({
        handle: generated.handle,
        cardCount: generated.cardsGenerated,
        artifactCount: generated.artifactsImported
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
      profile,
      publicProfile: toPublicProfile(profile),
      profileSources,
      readiness: profileReadiness(profile),
      discoverQuery: workspaceDiscoverQuery(profile)
    });
  });

  routes.get("/search", async (context) => {
    try {
      const query = z.string().min(1).parse(context.req.query("q"));
      const profiles = await options.store.listProfiles();
      const documents: PersonSearchDocument[] = profiles.map((profile) => toPublicProfile(profile)).map((profile) => ({
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
    const claims = await options.store.listProfileClaims(handle);
    return context.json({ handle, claims });
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

function planToGenerationInput(plan: ProfileGenerationPlan): z.infer<typeof profileGenerationSchema> {
  const sources = plan.sources.map((source) => {
    if (source.type === "manual") {
      const input = typeof source.input === "string" ? { note: source.input } : source.input;
      return {
        type: "manual" as const,
        input: {
          title: stringValue(input.title) ?? plan.inferredPerson.displayName ?? "Manual profile evidence",
          url: stringValue(input.url),
          note: stringValue(input.note) ?? stringValue(input.text) ?? plan.rawInput,
          description: stringValue(input.description)
        }
      };
    }
    return {
      type: source.type,
      input: String(source.input)
    } as z.infer<typeof profileGenerationSchema>["sources"][number];
  });

  for (const note of plan.manualNotes) {
    if (!sources.some((source) => source.type === "manual" && source.input.note === note.text)) {
      sources.push({
        type: "manual",
        input: {
          title: plan.inferredPerson.displayName ? `${plan.inferredPerson.displayName} note` : "Manual profile note",
          note: note.text
        }
      });
    }
  }

  if (sources.length === 0) {
    sources.push({
      type: "manual",
      input: {
        title: plan.inferredPerson.displayName ? `${plan.inferredPerson.displayName} profile request` : "Manual profile request",
        note: plan.rawInput
      }
    });
  }

  return {
    displayName: plan.inferredPerson.displayName,
    handle: plan.inferredPerson.handle,
    headline: plan.inferredPerson.headline,
    sources
  };
}

async function synthesizeProfileClaims(
  client: JsonLlmClient,
  plan: ProfileGenerationPlan,
  person: PersonProfileRecord["person"],
  bundles: Array<{ source: unknown }>,
  artifacts: ArtifactRecord[],
  deterministicClaims: ProfileClaimRecord[]
): Promise<ProfileClaimRecord[]> {
  if (artifacts.length === 0 || artifacts.every((artifact) => artifact.metadata?.source === "opendinq-review")) {
    return deterministicClaims;
  }

  const claims = await synthesizeClaimsWithEvidence({
    inferredPerson: { ...person, ...plan.inferredPerson },
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
    throw new Error("Person was not found.");
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
    ...profile,
    cards: publicCards(profile.cards),
    claims: approvedClaims(profile)
  };
}

function publicCards(cards: CardRecord[]): CardRecord[] {
  return cards
    .filter((card) => card.visibility !== "hidden")
    .toSorted((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.type.localeCompare(right.type) || left.title.localeCompare(right.title));
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
  const checks = [
    { label: "Add at least one source", complete: profile.sources.length > 0 },
    { label: "Review claims", complete: claims.length > 0 && claims.every((claim) => claim.status && claim.status !== "pending") },
    { label: "Publish at least three cards", complete: visibleCards.length >= 3 },
    { label: "Add headline", complete: Boolean(profile.person.headline) },
    { label: "Add manual note", complete: profile.cards.some((card) => card.type === "note") },
    { label: "Verify evidence", complete: approved.some((claim) => claim.evidence.length > 0) && visibleCards.some((card) => card.evidence.length > 0) }
  ];
  const score = Math.round((checks.filter((check) => check.complete).length / checks.length) * 100);
  return { score, checks };
}

function workspaceDiscoverQuery(profile: PersonProfileRecord): string {
  const skills = approvedClaims(profile).filter((claim) => claim.type === "skill").map((claim) => claim.text).slice(0, 4);
  return [profile.person.headline, ...skills].filter(Boolean).join(" ") || profile.person.displayName;
}
