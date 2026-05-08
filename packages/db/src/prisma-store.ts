import type {
  ArtifactRecord,
  CardRecord,
  EvidenceRecord,
  IdentitySourceRecord,
  OpenDinqStore,
  PersonProfileRecord,
  PersonRecord
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
  type: string;
  title: string;
  contentMd: string;
  dataJson: unknown;
  evidenceJson: unknown;
};

type DbPersonProfile = DbPerson & {
  sources: DbIdentitySource[];
  artifacts: DbArtifact[];
  cards: DbCard[];
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
  cards: true
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
    cards: person.cards.map(toCard)
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
    type: card.type,
    title: card.title,
    contentMd: card.contentMd,
    dataJson: isRecord(card.dataJson) ? card.dataJson : undefined,
    evidence: parseEvidence(card.evidenceJson)
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
  return {
    personId,
    type: card.type,
    title: card.title,
    contentMd: card.contentMd,
    dataJson: card.dataJson,
    evidenceJson: card.evidence
  };
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
    (value.type === "artifact" || value.type === "external") &&
    typeof value.title === "string" &&
    typeof value.reason === "string" &&
    (value.url === undefined || typeof value.url === "string")
  );
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
