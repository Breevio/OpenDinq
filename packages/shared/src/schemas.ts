import { z } from "zod";

export const identitySourceTypeSchema = z.enum([
  "github",
  "openalex",
  "arxiv",
  "website",
  "orcid",
  "manual"
]);

export const artifactTypeSchema = z.enum([
  "repo",
  "paper",
  "project",
  "post",
  "note",
  "website"
]);

export const cardTypeSchema = z.enum([
  "summary",
  "github",
  "skills",
  "works",
  "research",
  "timeline",
  "trajectory",
  "note",
  "search_match"
]);

export const evidenceRefSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["identity_source", "artifact", "card", "claim", "source", "external"]),
  title: z.string().min(1),
  url: z.string().url().optional(),
  reason: z.string().min(1)
});

export const personSchema = z.object({
  id: z.string().min(1).optional(),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  headline: z.string().min(1).optional(),
  bio: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
  publicStatus: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z.coerce.date().optional(),
  shareSlug: z.string().min(1).optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional()
});

export const identitySourceSchema = z.object({
  id: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  type: identitySourceTypeSchema,
  url: z.string().url(),
  externalId: z.string().min(1).optional(),
  rawJson: z.unknown().optional(),
  verifiedAt: z.coerce.date().optional(),
  createdAt: z.coerce.date().optional()
});

export const artifactSchema = z.object({
  id: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  type: artifactTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  url: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
  evidenceRaw: z.unknown().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional()
});

export const cardSchema = z.object({
  id: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  type: cardTypeSchema,
  title: z.string().min(1),
  contentMd: z.string().min(1),
  dataJson: z.record(z.unknown()).optional(),
  evidence: z.array(evidenceRefSchema).min(1),
  sourceIds: z.array(z.string().min(1)).optional(),
  claimIds: z.array(z.string().min(1)).optional(),
  confidence: z.number().min(0).max(1).optional(),
  visibility: z.enum(["public", "private", "hidden"]).default("public"),
  order: z.number().int().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional()
});

export const skillTagSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1)
});

export const personSkillSchema = z.object({
  personId: z.string().min(1),
  skillTagId: z.string().min(1),
  score: z.number().min(0).max(1),
  evidence: z.array(evidenceRefSchema).min(1)
});

export const searchQuerySchema = z.object({
  id: z.string().min(1).optional(),
  queryText: z.string().min(1),
  parsedJson: z.record(z.unknown()).optional(),
  createdAt: z.coerce.date().optional()
});

export const searchResultSchema = z.object({
  id: z.string().min(1).optional(),
  queryId: z.string().min(1).optional(),
  person: personSchema,
  score: z.number().min(0).max(1),
  scoreBreakdown: z.object({
    claimScore: z.number().min(0).max(1),
    cardScore: z.number().min(0).max(1),
    artifactScore: z.number().min(0).max(1),
    skillScore: z.number().min(0).max(1),
    evidenceScore: z.number().min(0).max(1),
    publishBoost: z.number().min(0).max(1),
    recencyScore: z.number().min(0).max(1),
    finalScore: z.number().min(0).max(1)
  }).optional(),
  explanation: z.string().min(1),
  evidence: z.array(evidenceRefSchema).min(1)
});

export type IdentitySourceType = z.infer<typeof identitySourceTypeSchema>;
export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type CardType = z.infer<typeof cardTypeSchema>;
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export type Person = z.infer<typeof personSchema>;
export type IdentitySource = z.infer<typeof identitySourceSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Card = z.infer<typeof cardSchema>;
export type SkillTag = z.infer<typeof skillTagSchema>;
export type PersonSkill = z.infer<typeof personSkillSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
