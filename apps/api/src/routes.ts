import {
  fetchArxivPaper,
  fetchGitHubRepos,
  fetchGitHubUser,
  fetchOpenAlexAuthor,
  fetchOpenAlexWorks,
  fetchOrcidRecord,
  fetchWebsiteMetadata,
  normalizeArxivPaperToArtifact,
  normalizeGitHubReposToArtifacts,
  normalizeGitHubUserToIdentitySource,
  normalizeGitHubUserToPerson,
  normalizeOpenAlexAuthorToIdentitySource,
  normalizeOpenAlexWorksToArtifacts,
  normalizeOrcidRecordToArtifacts,
  normalizeOrcidRecordToIdentitySource,
  normalizeWebsiteToArtifact,
  parseArxivId,
  parseGitHubProfileUrl
} from "@opendinq/connectors";
import { generateGitHubCard, generateSkillsCard, generateSummaryCard } from "@opendinq/cards";
import type { ArtifactRecord, IdentitySourceRecord, OpenDinqStore, PersonProfileRecord } from "@opendinq/core";
import { hybridSearchPeople, type PersonSearchDocument, type SearchArtifact } from "@opendinq/search";
import { Hono } from "hono";
import { z } from "zod";
import { createDemoProfiles } from "./demo-data.js";
import { errorResponse } from "./errors.js";

export type ApiRouteOptions = {
  store: OpenDinqStore;
  fetchImpl?: typeof fetch;
};

const importGitHubSchema = z.object({
  input: z.string().min(1)
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

  routes.post("/import/github", async (context) => {
    try {
      const body = importGitHubSchema.parse(await context.req.json());
      const username = parseGitHubProfileUrl(body.input);
      const fetchOptions = {
        fetchImpl: options.fetchImpl,
        token: process.env.GITHUB_TOKEN || undefined
      };
      const user = await fetchGitHubUser(username, fetchOptions);
      const repos = await fetchGitHubRepos(username, fetchOptions);
      const person = normalizeGitHubUserToPerson(user);
      const source = normalizeGitHubUserToIdentitySource(user);
      const artifacts = normalizeGitHubReposToArtifacts(repos) as SearchArtifact[];
      const cards = [
        generateSummaryCard(person, artifacts),
        generateGitHubCard(person, artifacts),
        generateSkillsCard(person, artifacts)
      ];

      await options.store.upsertProfile({
        person,
        sources: [source],
        artifacts,
        cards
      });

      return context.json({
        handle: person.handle,
        cardCount: cards.length,
        artifactCount: artifacts.length
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/website", async (context) => {
    try {
      const body = importWebsiteSchema.parse(await context.req.json());
      const metadata = await fetchWebsiteMetadata(body.url, { fetchImpl: options.fetchImpl });
      const source = {
        type: "website",
        url: metadata.url,
        rawJson: metadata
      };
      const profile = await appendProfileData(options.store, body.handle, [source], [normalizeWebsiteToArtifact(metadata)]);

      if (!profile) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json(importSummary(profile));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/openalex", async (context) => {
    try {
      const body = importForHandleSchema.parse(await context.req.json());
      const fetchOptions = { fetchImpl: options.fetchImpl };
      const author = await fetchOpenAlexAuthor(body.input, fetchOptions);
      const works = await fetchOpenAlexWorks(author.id, fetchOptions);
      const profile = await appendProfileData(
        options.store,
        body.handle,
        [normalizeOpenAlexAuthorToIdentitySource(author)],
        normalizeOpenAlexWorksToArtifacts(works)
      );

      if (!profile) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json(importSummary(profile));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/arxiv", async (context) => {
    try {
      const body = importForHandleSchema.parse(await context.req.json());
      const paper = await fetchArxivPaper(body.input, { fetchImpl: options.fetchImpl });
      const artifact = normalizeArxivPaperToArtifact(paper);
      const source = {
        type: "arxiv",
        url: paper.url,
        externalId: parseArxivId(body.input),
        rawJson: paper
      };
      const profile = await appendProfileData(options.store, body.handle, [source], [artifact]);

      if (!profile) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json(importSummary(profile));
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post("/import/orcid", async (context) => {
    try {
      const body = importForHandleSchema.parse(await context.req.json());
      const record = await fetchOrcidRecord(body.input, { fetchImpl: options.fetchImpl });
      const profile = await appendProfileData(
        options.store,
        body.handle,
        [normalizeOrcidRecordToIdentitySource(record)],
        normalizeOrcidRecordToArtifacts(record)
      );

      if (!profile) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json(importSummary(profile));
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
        cards: profile.cards
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
      const profile = await appendProfileData(options.store, context.req.param("handle"), [], [
        {
          ...artifact,
          evidenceRaw: {
            source: "manual"
          }
        }
      ]);

      if (!profile) {
        return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
      }

      return context.json(importSummary(profile), 201);
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
  const cards = [
    generateSummaryCard(profile.person, mergedArtifacts),
    generateGitHubCard(profile.person, mergedArtifacts),
    generateSkillsCard(profile.person, mergedArtifacts),
    ...noteCards
  ];

  return store.upsertProfile({
    person: profile.person,
    sources: dedupeSources([...profile.sources, ...sources]),
    artifacts: mergedArtifacts,
    cards
  });
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
