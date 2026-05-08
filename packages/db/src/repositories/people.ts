import type {
  ArtifactInput,
  CardInput,
  IdentitySourceInput,
  PersonInput,
  PrismaRepositoryClient
} from "./types.js";

export async function upsertPerson(client: PrismaRepositoryClient, person: PersonInput) {
  return client.person.upsert({
    where: { handle: person.handle },
    update: person,
    create: person
  });
}

export async function upsertIdentitySource(
  client: PrismaRepositoryClient,
  source: IdentitySourceInput
) {
  return client.identitySource.upsert({
    where: {
      type_url: {
        type: source.type,
        url: source.url
      }
    },
    update: source,
    create: source
  });
}

export async function upsertArtifacts(client: PrismaRepositoryClient, artifacts: ArtifactInput[]) {
  const savedArtifacts = [];

  for (const artifact of artifacts) {
    const existingArtifact = artifact.url
      ? await client.artifact.findFirst({
          where: {
            personId: artifact.personId,
            type: artifact.type,
            url: artifact.url
          }
        })
      : null;

    if (isRecord(existingArtifact) && typeof existingArtifact.id === "string") {
      savedArtifacts.push(
        await client.artifact.update({
          where: { id: existingArtifact.id },
          data: artifact
        })
      );
      continue;
    }

    savedArtifacts.push(await client.artifact.create({ data: artifact }));
  }

  return savedArtifacts;
}

export function getPersonByHandle(client: PrismaRepositoryClient, handle: string) {
  return client.person.findUnique({
    where: { handle },
    include: {
      sources: true,
      artifacts: true,
      cards: true,
      skills: {
        include: {
          skillTag: true
        }
      }
    }
  });
}

export function listPeople(client: PrismaRepositoryClient) {
  return client.person.findMany({
    orderBy: { updatedAt: "desc" }
  });
}

export function getArtifactsForPerson(client: PrismaRepositoryClient, personId: string) {
  return client.artifact.findMany({
    where: { personId },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
  });
}

export function saveCard(client: PrismaRepositoryClient, card: CardInput) {
  return client.card.create({
    data: card
  });
}

export function listCardsForPerson(client: PrismaRepositoryClient, personId: string) {
  return client.card.findMany({
    where: { personId },
    orderBy: { updatedAt: "desc" }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

