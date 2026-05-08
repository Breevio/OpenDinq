import { generateProfileCards } from "@opendinq/cards";
import type { ArtifactRecord, IdentitySourceRecord, OpenDinqStore, PersonProfileRecord, ProfileClaimRecord } from "@opendinq/core";
import { hybridSearchPeople, type PersonSearchDocument, type SearchArtifact } from "@opendinq/search";
import { Hono } from "hono";
import { z } from "zod";
import { createDemoProfiles } from "./demo-data.js";
import { errorResponse } from "./errors.js";
import { createProfileGenerator, getProfileRunSummary } from "./profile-generator.js";

export type ApiRouteOptions = {
  store: OpenDinqStore;
  fetchImpl?: typeof fetch;
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

const createNoteCardSchema = z.object({
  title: z.string().min(1),
  contentMd: z.string().min(1)
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

    return context.json(profile);
  });

  routes.get("/search", async (context) => {
    try {
      const query = z.string().min(1).parse(context.req.query("q"));
      const profiles = await options.store.listProfiles();
      const documents: PersonSearchDocument[] = profiles.map((profile) => ({
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

    return context.json({ handle, cards });
  });

  routes.post("/cards/:handle/note", async (context) => {
    try {
      const handle = context.req.param("handle");
      const body = createNoteCardSchema.parse(await context.req.json());
      const card = await options.store.saveCard(handle, {
        type: "note",
        title: body.title,
        contentMd: body.contentMd,
        dataJson: {
          source: "manual"
        },
        evidence: [
          {
            id: `manual-note-${handle}-${Date.now()}`,
            type: "external",
            title: body.title,
            reason: "Manual note supplied through the OpenDinq API."
          }
        ]
      });

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

async function appendProfileData(
  store: OpenDinqStore,
  handle: string,
  sources: IdentitySourceRecord[],
  artifacts: ArtifactRecord[]
): Promise<PersonProfileRecord | undefined> {
  const profile = await store.getProfile(handle);
  if (!profile) {
    return undefined;
  }

  const mergedArtifacts = dedupeArtifacts([...profile.artifacts, ...artifacts]);
  const noteCards = profile.cards.filter((card) => card.type === "note");
  const cards = [...generateProfileCards(profile.person, mergedArtifacts, (profile.claims ?? []) as ProfileClaimRecord[]), ...noteCards];

  return store.upsertProfile({
    person: profile.person,
    sources: dedupeSources([...profile.sources, ...sources]),
    artifacts: mergedArtifacts,
    cards
  });
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

function dedupeSources(sources: IdentitySourceRecord[]): IdentitySourceRecord[] {
  const byKey = new Map<string, IdentitySourceRecord>();
  for (const source of sources) {
    byKey.set(`${source.type}:${source.url}`, source);
  }

  return [...byKey.values()];
}

function dedupeArtifacts(artifacts: ArtifactRecord[]): ArtifactRecord[] {
  const byKey = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    byKey.set(`${artifact.type}:${artifact.url ?? artifact.title}`, artifact);
  }

  return [...byKey.values()];
}

function importSummary(profile: PersonProfileRecord) {
  return {
    handle: profile.person.handle,
    sourceCount: profile.sources.length,
    artifactCount: profile.artifacts.length,
    cardCount: profile.cards.length
  };
}
