import { describe, expect, it, vi } from "vitest";
import {
  getArtifactsForPerson,
  getPersonByHandle,
  listCardsForPerson,
  listPeople,
  saveCard,
  upsertArtifacts,
  upsertIdentitySource,
  upsertPerson
} from "./people.js";
import type { PrismaRepositoryClient } from "./types.js";

describe("people repositories", () => {
  it("upserts people by handle", async () => {
    const client = createMockClient();

    await upsertPerson(client, {
      handle: "demo",
      displayName: "Demo Builder",
      headline: "AI agent engineer"
    });

    expect(client.person.upsert).toHaveBeenCalledWith({
      where: { handle: "demo" },
      update: {
        handle: "demo",
        displayName: "Demo Builder",
        headline: "AI agent engineer"
      },
      create: {
        handle: "demo",
        displayName: "Demo Builder",
        headline: "AI agent engineer"
      }
    });
  });

  it("upserts identity sources by type and url", async () => {
    const client = createMockClient();

    await upsertIdentitySource(client, {
      personId: "person-1",
      type: "github",
      url: "https://github.com/demo",
      externalId: "123"
    });

    expect(client.identitySource.upsert).toHaveBeenCalledWith({
      where: {
        type_url: {
          type: "github",
          url: "https://github.com/demo"
        }
      },
      update: {
        personId: "person-1",
        type: "github",
        url: "https://github.com/demo",
        externalId: "123"
      },
      create: {
        personId: "person-1",
        type: "github",
        url: "https://github.com/demo",
        externalId: "123"
      }
    });
  });

  it("updates existing artifacts and creates new ones", async () => {
    const client = createMockClient();
    client.artifact.findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "artifact-1" })
      .mockResolvedValueOnce(null);

    await upsertArtifacts(client, [
      {
        personId: "person-1",
        type: "repo",
        title: "demo/agent-tools",
        url: "https://github.com/demo/agent-tools"
      },
      {
        personId: "person-1",
        type: "repo",
        title: "demo/search-tools",
        url: "https://github.com/demo/search-tools"
      }
    ]);

    expect(client.artifact.update).toHaveBeenCalledWith({
      where: { id: "artifact-1" },
      data: expect.objectContaining({ title: "demo/agent-tools" })
    });
    expect(client.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "demo/search-tools" })
    });
  });

  it("reads people, artifacts, and cards with stable ordering", async () => {
    const client = createMockClient();

    await getPersonByHandle(client, "demo");
    await listPeople(client);
    await getArtifactsForPerson(client, "person-1");
    await saveCard(client, {
      personId: "person-1",
      type: "summary",
      title: "Summary",
      contentMd: "Builds tools.",
      evidenceJson: [{ id: "artifact-1" }]
    });
    await listCardsForPerson(client, "person-1");

    expect(client.person.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { handle: "demo" } })
    );
    expect(client.person.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" }
    });
    expect(client.artifact.findMany).toHaveBeenCalledWith({
      where: { personId: "person-1" },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }]
    });
    expect(client.card.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "Summary" })
    });
    expect(client.card.findMany).toHaveBeenCalledWith({
      where: { personId: "person-1" },
      orderBy: { updatedAt: "desc" }
    });
  });
});

function createMockClient(): PrismaRepositoryClient {
  return {
    person: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([])
    },
    identitySource: {
      upsert: vi.fn().mockResolvedValue({})
    },
    artifact: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({})
    },
    card: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([])
    }
  };
}

