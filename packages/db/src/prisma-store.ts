import type {
  ArtifactRecord,
  CardPatchRecord,
  CardRecord,
  EvidenceRecord,
  IdentitySourceRecord,
  OpenDinqStore,
  PersonProfileRecord,
  PersonRecord,
  ProfileClaimRecord,
  ProfileGenerationRunRecord,
  ProfileSourceRecord
} from "@opendinq/core";

export type PrismaStoreClient = {
  person: {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown | null>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  identitySource: {
    upsert(args: unknown): Promise<unknown>;
  };
  artifact: {
    findFirst(args: unknown): Promise<unknown | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  card: {
    create(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  profileGenerationRun: {
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown | null>;
  };
  profileSource: {
    createMany(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  profileClaim: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
  };
};

type DbPerson = {
  id: string;
  handle: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;
};

type DbIdentitySource = {
  type: string;
  url: string;
  externalId: string | null;
  rawJson: unknown;
};

type DbArtifact = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  url: string | null;
  metadata: unknown;
  evidenceRaw: unknown;
};

type DbCard = {
  id: string;
  personId: string;
  type: string;
  title: string;
  contentMd: string;
  dataJson: unknown;
  evidenceJson: unknown;
  sourceIds?: unknown;
  claimIds?: unknown;
  confidence?: number | null;
  visibility?: string | null;
  order?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type DbPersonProfile = DbPerson & {
  sources: DbIdentitySource[];
  artifacts: DbArtifact[];
  cards: DbCard[];
  claims?: DbProfileClaim[];
};

type DbProfileClaim = {
  id: string;
  sourceId: string | null;
  artifactId: string | null;
  type: string;
  text: string;
  confidence: number;
  evidenceJson: unknown;
};

type DbProfileSource = {
  id: string;
  personId: string | null;
  runId: string | null;
  type: string;
  url: string | null;
  status: string;
  rawJson: unknown;
  normalizedJson: unknown;
  warningsJson: unknown;
};

export function createPrismaStore(client: PrismaStoreClient): OpenDinqStore {
  const store: OpenDinqStore = {
    async upsertProfile(record) {
      const person = await client.person.upsert({
        where: { handle: record.person.handle },
        update: record.person,
        create: record.person
      });
      const personId = idFromRecord(person, "person");

      await Promise.all(
        record.sources.map((source) =>
          client.identitySource.upsert({
            where: {
              type_url: {
                type: source.type,
                url: source.url
              }
            },
            update: toSourceInput(personId, source),
            create: toSourceInput(personId, source)
          })
        )
      );

      for (const artifact of record.artifacts) {
        const existingArtifact = artifact.url
          ? await client.artifact.findFirst({
              where: {
                personId,
                type: artifact.type,
                url: artifact.url
              }
            })
          : null;
        const data = toArtifactInput(personId, artifact);

        if (hasStringId(existingArtifact)) {
          await client.artifact.update({
            where: { id: existingArtifact.id },
            data
          });
        } else {
          await client.artifact.create({ data });
        }
      }

      await client.card.deleteMany({ where: { personId } });
      await Promise.all(record.cards.map((card) => client.card.create({ data: toCardInput(personId, card) })));

      await client.profileClaim.deleteMany({ where: { personId } });
      if (record.claims?.length) {
        await client.profileClaim.createMany({
          data: record.claims.map((claim) => toClaimInput(personId, claim, false))
        });
      }

      const savedProfile = await getProfileByHandle(client, record.person.handle);
      return savedProfile ?? record;
    },
    async getProfile(handle) {
      return getProfileByHandle(client, handle);
    },
    async listProfiles() {
      const people = await client.person.findMany({
        orderBy: { handle: "asc" },
        include: profileInclude
      });

      return people.map((person) => toProfile(person as DbPersonProfile));
    },
    async listCards(handle) {
      const profile = await getProfileByHandle(client, handle);
      return profile?.cards;
    },
    async saveCard(handle, card) {
      const person = await client.person.findUnique({
        where: { handle },
        select: { id: true }
      });
      if (!hasStringId(person)) {
        return undefined;
      }

      const savedCard = await client.card.create({
        data: toCardInput(person.id, card)
      });

      return toCard(savedCard as DbCard);
    },
    async updateCard(cardId: string, patch: CardPatchRecord) {
      try {
        const saved = await client.card.update({
          where: { id: cardId },
          data: toCardPatchInput(patch)
        });
        return toCard(saved as DbCard);
      } catch {
        return undefined;
      }
    },
    async createProfileRun(run) {
      const saved = await client.profileGenerationRun.create({ data: toRunInput(run) });
      return toRun(saved as DbProfileGenerationRun);
    },
    async updateProfileRun(runId, patch) {
      const saved = await client.profileGenerationRun.update({
        where: { id: runId },
        data: toRunPatch(patch)
      });
      return toRun(saved as DbProfileGenerationRun);
    },
    async getProfileRun(runId) {
      const run = await client.profileGenerationRun.findUnique({ where: { id: runId } });
      return run ? toRun(run as DbProfileGenerationRun) : undefined;
    },
    async saveProfileSources(handle, sources) {
      const person = await client.person.findUnique({
        where: { handle },
        select: { id: true }
      });
      if (!hasStringId(person)) {
        return [];
      }
      await client.profileSource.createMany({
        data: sources.map((source) => toProfileSourceInput(person.id, source))
      });
      return sources;
    },
    async listProfileSources(runId) {
      const sources = await client.profileSource.findMany({ where: { runId } });
      return sources.map((source) => toProfileSource(source as DbProfileSource));
    },
    async saveProfileClaims(handle, claims) {
      const person = await client.person.findUnique({
        where: { handle },
        select: { id: true }
      });
      if (!hasStringId(person)) {
        return [];
      }
      await client.profileClaim.deleteMany({ where: { personId: person.id } });
      await client.profileClaim.createMany({ data: claims.map((claim) => toClaimInput(person.id, claim, true)) });
      return claims;
    },
    async listProfileClaims(handle) {
      const person = await client.person.findUnique({
        where: { handle },
        select: { id: true }
      });
      if (!hasStringId(person)) {
        return [];
      }
      const claims = await client.profileClaim.findMany({ where: { personId: person.id } });
      return claims.map((claim) => toClaim(claim as DbProfileClaim));
    }
  };

  return store;
}

export async function createPrismaStoreFromGeneratedClient(): Promise<OpenDinqStore> {
  const prismaModule = (await import("@prisma/client")) as unknown as {
    PrismaClient: new () => PrismaStoreClient;
  };

  return createPrismaStore(new prismaModule.PrismaClient());
}

const profileInclude = {
  sources: true,
  artifacts: true,
  cards: {
    orderBy: [
      { order: "asc" },
      { type: "asc" },
      { title: "asc" }
    ]
  },
  claims: true
} as const;

async function getProfileByHandle(client: PrismaStoreClient, handle: string): Promise<PersonProfileRecord | undefined> {
  const person = await client.person.findUnique({
    where: { handle },
    include: profileInclude
  });

  return person ? toProfile(person as DbPersonProfile) : undefined;
}

function toProfile(person: DbPersonProfile): PersonProfileRecord {
  return {
    person: toPerson(person),
    sources: person.sources.map(toSource),
    artifacts: person.artifacts.map(toArtifact),
    cards: person.cards.map(toCard),
    claims: (person.claims ?? []).map(toClaim)
  };
}

function toPerson(person: DbPerson): PersonRecord {
  return compactRecord<PersonRecord>({
    handle: person.handle,
    displayName: person.displayName,
    headline: person.headline ?? undefined,
    bio: person.bio ?? undefined,
    location: person.location ?? undefined,
    avatarUrl: person.avatarUrl ?? undefined
  });
}

function toSource(source: DbIdentitySource): IdentitySourceRecord {
  return compactRecord<IdentitySourceRecord>({
    type: source.type,
    url: source.url,
    externalId: source.externalId ?? undefined,
    rawJson: source.rawJson
  });
}

function toArtifact(artifact: DbArtifact): ArtifactRecord {
  return compactRecord<ArtifactRecord>({
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    description: artifact.description ?? undefined,
    url: artifact.url ?? undefined,
    metadata: isRecord(artifact.metadata) ? artifact.metadata : undefined,
    evidenceRaw: artifact.evidenceRaw
  });
}

function toCard(card: DbCard): CardRecord {
  return compactRecord<CardRecord>({
    id: card.id,
    personId: card.personId,
    type: card.type,
    title: card.title,
    contentMd: card.contentMd,
    dataJson: isRecord(card.dataJson) ? card.dataJson : undefined,
    evidence: parseEvidence(card.evidenceJson),
    sourceIds: stringArray(card.sourceIds),
    claimIds: stringArray(card.claimIds),
    confidence: card.confidence ?? undefined,
    visibility: isCardVisibility(card.visibility) ? card.visibility : "public",
    order: card.order ?? undefined,
    createdAt: card.createdAt?.toISOString(),
    updatedAt: card.updatedAt?.toISOString()
  });
}

function toSourceInput(personId: string, source: IdentitySourceRecord) {
  return {
    personId,
    type: source.type,
    url: source.url,
    externalId: source.externalId,
    rawJson: source.rawJson
  };
}

function toArtifactInput(personId: string, artifact: ArtifactRecord) {
  return {
    personId,
    type: artifact.type,
    title: artifact.title,
    description: artifact.description,
    url: artifact.url,
    metadata: artifact.metadata,
    evidenceRaw: artifact.evidenceRaw
  };
}

function toCardInput(personId: string, card: CardRecord) {
  return compactRecord({
    id: card.id,
    personId,
    type: card.type,
    title: card.title,
    contentMd: card.contentMd,
    dataJson: card.dataJson,
    evidenceJson: card.evidence,
    sourceIds: card.sourceIds,
    claimIds: card.claimIds,
    confidence: card.confidence,
    visibility: card.visibility ?? "public",
    order: card.order ?? 0
  });
}

function toCardPatchInput(patch: CardPatchRecord) {
  return compactRecord({
    title: patch.title,
    contentMd: patch.contentMd,
    visibility: patch.visibility,
    order: patch.order
  });
}

type DbProfileGenerationRun = {
  id: string;
  targetHandle: string;
  displayName: string;
  status: string;
  inputJson: unknown;
  sourceSummaryJson: unknown;
  warningsJson: unknown;
  errorJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  generatedProfileHandle: string | null;
};

function toRun(run: DbProfileGenerationRun): ProfileGenerationRunRecord {
  return {
    id: run.id,
    targetHandle: run.targetHandle,
    displayName: run.displayName,
    status: isRunStatus(run.status) ? run.status : "needs_review",
    inputJson: run.inputJson,
    sourceSummaryJson: run.sourceSummaryJson,
    warningsJson: run.warningsJson,
    errorJson: run.errorJson,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    generatedProfileHandle: run.generatedProfileHandle ?? undefined
  };
}

function toRunInput(run: ProfileGenerationRunRecord) {
  return {
    id: run.id,
    targetHandle: run.targetHandle,
    displayName: run.displayName,
    status: run.status,
    inputJson: run.inputJson,
    sourceSummaryJson: run.sourceSummaryJson,
    warningsJson: run.warningsJson,
    errorJson: run.errorJson,
    generatedProfileHandle: run.generatedProfileHandle
  };
}

function toRunPatch(patch: Partial<ProfileGenerationRunRecord>) {
  return compactRecord({
    targetHandle: patch.targetHandle,
    displayName: patch.displayName,
    status: patch.status,
    inputJson: patch.inputJson,
    sourceSummaryJson: patch.sourceSummaryJson,
    warningsJson: patch.warningsJson,
    errorJson: patch.errorJson,
    generatedProfileHandle: patch.generatedProfileHandle
  });
}

function toProfileSourceInput(personId: string, source: ProfileSourceRecord) {
  return compactRecord({
    id: source.id,
    personId,
    runId: source.runId,
    type: source.type,
    url: source.url,
    status: source.status,
    rawJson: source.rawJson,
    normalizedJson: source.normalizedJson,
    warningsJson: source.warnings
  });
}

function toProfileSource(source: DbProfileSource): ProfileSourceRecord {
  return compactRecord<ProfileSourceRecord>({
    id: source.id,
    personId: source.personId ?? undefined,
    runId: source.runId ?? undefined,
    type: isSourceType(source.type) ? source.type : "manual",
    url: source.url ?? undefined,
    status: isRunStatus(source.status) ? source.status : "needs_review",
    rawJson: source.rawJson,
    normalizedJson: source.normalizedJson,
    warnings: Array.isArray(source.warningsJson) ? source.warningsJson.filter((item): item is string => typeof item === "string") : undefined
  });
}

function toClaimInput(personId: string, claim: ProfileClaimRecord, preserveReferences: boolean) {
  return {
    personId,
    sourceId: preserveReferences ? claim.sourceId : undefined,
    artifactId: preserveReferences ? claim.artifactId : undefined,
    type: claim.type,
    text: claim.text,
    confidence: claim.confidence,
    evidenceJson: claim.evidence
  };
}

function toClaim(claim: DbProfileClaim): ProfileClaimRecord {
  return compactRecord<ProfileClaimRecord>({
    id: claim.id,
    sourceId: claim.sourceId ?? undefined,
    artifactId: claim.artifactId ?? undefined,
    type: isClaimType(claim.type) ? claim.type : "summary",
    text: claim.text,
    confidence: claim.confidence,
    evidence: parseEvidence(claim.evidenceJson)
  });
}

function parseEvidence(value: unknown): EvidenceRecord[] {
  return Array.isArray(value) ? value.filter(isEvidenceRecord) : [];
}

function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.type === "artifact" || value.type === "claim" || value.type === "source" || value.type === "external") &&
    typeof value.title === "string" &&
    typeof value.reason === "string" &&
    (value.url === undefined || typeof value.url === "string")
  );
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function isRunStatus(value: string): value is ProfileGenerationRunRecord["status"] {
  return ["pending", "running", "completed", "failed", "needs_review"].includes(value);
}

function isSourceType(value: string): value is ProfileSourceRecord["type"] {
  return ["github", "website", "openalex", "arxiv", "orcid", "manual"].includes(value);
}

function isClaimType(value: string): value is ProfileClaimRecord["type"] {
  return ["skill", "role", "project", "research_area", "achievement", "affiliation", "link", "summary"].includes(value);
}

function isCardVisibility(value: unknown): value is CardRecord["visibility"] {
  return value === "public" || value === "private" || value === "hidden";
}

function idFromRecord(value: unknown, label: string): string {
  if (!hasStringId(value)) {
    throw new Error(`Prisma ${label} record did not include an id.`);
  }

  return value.id;
}

function hasStringId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactRecord<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== undefined)) as T;
}
