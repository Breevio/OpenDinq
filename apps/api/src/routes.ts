import {
  fetchGitHubRepos,
  fetchGitHubUser,
  normalizeGitHubReposToArtifacts,
  normalizeGitHubUserToIdentitySource,
  normalizeGitHubUserToPerson,
  parseGitHubProfileUrl
} from "@opendinq/connectors";
import { generateGitHubCard, generateSkillsCard, generateSummaryCard } from "@opendinq/cards";
import { searchPeople, type PersonSearchDocument, type SearchArtifact } from "@opendinq/search";
import { Hono } from "hono";
import { z } from "zod";
import { createDemoProfiles } from "./demo-data.js";
import { errorResponse } from "./errors.js";
import type { ApiStore } from "./store.js";

export type ApiRouteOptions = {
  store: ApiStore;
  fetchImpl?: typeof fetch;
};

const importGitHubSchema = z.object({
  input: z.string().min(1)
});

const createNoteCardSchema = z.object({
  title: z.string().min(1),
  contentMd: z.string().min(1)
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

      options.store.upsertProfile({
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

  routes.get("/people/:handle", (context) => {
    const profile = options.store.getProfile(context.req.param("handle"));

    if (!profile) {
      return context.json({ error: { code: "not_found", message: "Person was not found." } }, 404);
    }

    return context.json(profile);
  });

  routes.get("/search", (context) => {
    try {
      const query = z.string().min(1).parse(context.req.query("q"));
      const documents: PersonSearchDocument[] = options.store.listProfiles().map((profile) => ({
        person: profile.person,
        artifacts: profile.artifacts,
        cards: profile.cards
      }));

      return context.json({
        query,
        results: searchPeople(query, documents)
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.get("/cards/:handle", (context) => {
    const handle = context.req.param("handle");
    const cards = options.store.listCards(handle);

    if (!cards) {
      return context.json({ error: { code: "not_found", message: "Cards were not found." } }, 404);
    }

    return context.json({ handle, cards });
  });

  routes.post("/cards/:handle/note", async (context) => {
    try {
      const handle = context.req.param("handle");
      const body = createNoteCardSchema.parse(await context.req.json());
      const card = options.store.saveCard(handle, {
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
            reason: "Manual note supplied through the OpenDINQ API."
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

  routes.post("/seed/demo", (context) => {
    const profiles = createDemoProfiles();
    profiles.forEach((profile) => options.store.upsertProfile(profile));

    return context.json({
      profileCount: profiles.length,
      handles: profiles.map((profile) => profile.person.handle)
    });
  });

  return routes;
}
