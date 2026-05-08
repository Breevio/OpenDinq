import { describe, expect, it, vi } from "vitest";
import { createPrismaStore } from "./prisma-store.js";

describe("PrismaStore", () => {
  it("persists a profile through Prisma and returns the API profile shape", async () => {
    const client = createMockClient();
    const store = createPrismaStore(client);

    await expect(
      store.upsertProfile({
        person: {
          handle: "demo",
          displayName: "Demo Builder",
          headline: "Builds tools"
        },
        sources: [{ type: "github", url: "https://github.com/demo", externalId: "123" }],
        artifacts: [
          {
            type: "repo",
            title: "demo/agent-tools",
            url: "https://github.com/demo/agent-tools",
            metadata: { language: "TypeScript" }
          }
        ],
        cards: [
          {
            type: "summary",
            title: "Summary",
            contentMd: "Builds tools.",
            evidence: [{ id: "artifact-0", type: "artifact", title: "demo/agent-tools", reason: "Repo evidence." }]
          }
        ]
      })
    ).resolves.toMatchObject({
      person: { handle: "demo" },
      cards: [{ type: "summary" }]
    });

    expect(client.person.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { handle: "demo" }
      })
    );
    expect(client.identitySource.upsert).toHaveBeenCalled();
    expect(client.artifact.create).toHaveBeenCalled();
    expect(client.card.deleteMany).toHaveBeenCalledWith({ where: { personId: "person-1" } });
    expect(client.card.create).toHaveBeenCalled();
  });

  it("appends note cards for existing people and returns undefined for missing people", async () => {
    const client = createMockClient();
    const store = createPrismaStore(client);

    await expect(
      store.saveCard("demo", {
        type: "note",
        title: "Note",
        contentMd: "Manual note.",
        evidence: [{ id: "note", type: "external", title: "Note", reason: "Manual note." }]
      })
    ).resolves.toMatchObject({ type: "note", title: "Note" });

    client.person.findUnique.mockResolvedValueOnce(null);
    await expect(
      store.saveCard("missing", {
        type: "note",
        title: "Missing",
        contentMd: "Missing note.",
        evidence: [{ id: "note", type: "external", title: "Missing", reason: "Manual note." }]
      })
    ).resolves.toBeUndefined();
  });

  it("updates allowed card fields", async () => {
    const client = createMockClient();
    const store = createPrismaStore(client);

    await expect(store.updateCard("card-1", { title: "Updated", visibility: "hidden", order: 90 })).resolves.toMatchObject({
      id: "card-1",
      title: "Updated",
      visibility: "hidden",
      order: 90
    });

    expect(client.card.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: {
        title: "Updated",
        visibility: "hidden",
        order: 90
      }
    });
  });
});

function createMockClient() {
  const profile = {
    id: "person-1",
    handle: "demo",
    displayName: "Demo Builder",
    headline: "Builds tools",
    bio: null,
    location: null,
    avatarUrl: null,
    sources: [{ type: "github", url: "https://github.com/demo", externalId: "123", rawJson: null }],
    artifacts: [
      {
        id: "artifact-1",
        type: "repo",
        title: "demo/agent-tools",
        description: null,
        url: "https://github.com/demo/agent-tools",
        metadata: { language: "TypeScript" },
        evidenceRaw: null
      }
    ],
    cards: [
      {
        id: "card-1",
        personId: "person-1",
        type: "summary",
        title: "Summary",
        contentMd: "Builds tools.",
        dataJson: null,
        evidenceJson: [{ id: "artifact-0", type: "artifact", title: "demo/agent-tools", reason: "Repo evidence." }],
        visibility: "public",
        order: 10,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ],
    claims: []
  };

  return {
    person: {
      upsert: vi.fn().mockResolvedValue({ id: "person-1" }),
      findUnique: vi.fn().mockResolvedValue(profile),
      findMany: vi.fn().mockResolvedValue([profile])
    },
    identitySource: {
      upsert: vi.fn().mockResolvedValue({})
    },
    artifact: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(profile.artifacts),
      create: vi.fn().mockResolvedValue({ id: "artifact-1" }),
      update: vi.fn().mockResolvedValue({ id: "artifact-1" })
    },
    card: {
      create: vi.fn().mockResolvedValue({
        id: "card-note",
        personId: "person-1",
        type: "note",
        title: "Note",
        contentMd: "Manual note.",
        dataJson: null,
        evidenceJson: [{ id: "note", type: "external", title: "Note", reason: "Manual note." }],
        visibility: "public",
        order: 60,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      findMany: vi.fn().mockResolvedValue(profile.cards),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({
        id: "card-1",
        personId: "person-1",
        type: "summary",
        title: data.title ?? "Summary",
        contentMd: data.contentMd ?? "Builds tools.",
        dataJson: null,
        evidenceJson: [{ id: "artifact-0", type: "artifact", title: "demo/agent-tools", reason: "Repo evidence." }],
        visibility: data.visibility ?? "public",
        order: data.order ?? 10,
        createdAt: new Date(),
        updatedAt: new Date()
      }))
    },
    profileGenerationRun: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, createdAt: new Date(), updatedAt: new Date() })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "run-1", targetHandle: "demo", displayName: "Demo", inputJson: {}, ...data, createdAt: new Date(), updatedAt: new Date() })),
      findUnique: vi.fn().mockResolvedValue(null)
    },
    profileSource: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([])
    },
    profileClaim: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([])
    }
  };
}
