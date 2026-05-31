import { describe, expect, it } from "vitest";
import type { PersonProfileRecord } from "../store.js";
import { createMemoryStore } from "./memory-store.js";

const demoProfile: PersonProfileRecord = {
  person: {
    handle: "demo",
    displayName: "Demo Builder",
    headline: "Builds agent tools"
  },
  sources: [
    {
      type: "github",
      url: "https://github.com/demo",
      externalId: "123"
    }
  ],
  artifacts: [
    {
      type: "repo",
      title: "demo/agent-tools",
      url: "https://github.com/demo/agent-tools"
    }
  ],
  cards: [
    {
      type: "summary",
      title: "Summary",
      contentMd: "Builds agent tools.",
      evidence: [
        {
          id: "artifact-0",
          type: "artifact",
          title: "demo/agent-tools",
          url: "https://github.com/demo/agent-tools",
          reason: "Demo evidence."
        }
      ]
    }
  ],
  claims: [
    {
      type: "project",
      text: "Builds agent tools",
      confidence: 0.84,
      evidence: [
        {
          id: "artifact-0",
          type: "artifact",
          title: "demo/agent-tools",
          url: "https://github.com/demo/agent-tools",
          reason: "Demo evidence."
        }
      ]
    }
  ]
};

describe("MemoryStore", () => {
  it("upserts, reads, lists, and appends cards", async () => {
    const store = createMemoryStore();

    await expect(store.upsertProfile(demoProfile)).resolves.toMatchObject({
      person: demoProfile.person,
      cards: [expect.objectContaining({ id: expect.any(String), visibility: "public", order: 1 })]
    });
    await expect(store.getProfile("demo")).resolves.toMatchObject({
      person: demoProfile.person,
      cards: [expect.objectContaining({ type: "summary", visibility: "public" })],
      claims: [expect.objectContaining({ id: "claim-demo-0", personId: "demo", status: "approved" })]
    });
    await expect(store.listProfiles()).resolves.toHaveLength(1);
    await expect(store.listCards("demo")).resolves.toHaveLength(1);

    await expect(
      store.saveCard("demo", {
        type: "note",
        title: "Note",
        contentMd: "Manual note",
        evidence: [
          {
            id: "manual-note",
            type: "external",
            title: "Note",
            reason: "Manual note."
          }
        ]
      })
    ).resolves.toMatchObject({ type: "note" });

    await expect(store.listCards("demo")).resolves.toHaveLength(2);
    const cards = await store.listCards("demo");
    const note = cards?.find((card) => card.type === "note");
    expect(note).toMatchObject({ id: expect.any(String), personId: "demo", visibility: "public" });
    await expect(store.updateCard(note?.id ?? "missing", { title: "Hidden note", visibility: "hidden" })).resolves.toMatchObject({
      title: "Hidden note",
      visibility: "hidden"
    });
  });

  it("returns undefined for missing profiles", async () => {
    const store = createMemoryStore();

    await expect(store.getProfile("missing")).resolves.toBeUndefined();
    await expect(store.listCards("missing")).resolves.toBeUndefined();
    await expect(
      store.saveCard("missing", {
        type: "note",
        title: "Missing",
        contentMd: "Missing",
        evidence: [{ id: "note", type: "external", title: "Missing", reason: "Manual note." }]
      })
    ).resolves.toBeUndefined();
    await expect(store.updateCard("missing", { title: "Missing" })).resolves.toBeUndefined();
  });

  it("round-trips profile claims, card visibility, and profile sources", async () => {
    const store = createMemoryStore([demoProfile]);

    const claims = await store.saveProfileClaims("demo", [
      {
        type: "skill",
        text: "TypeScript",
        confidence: 0.8,
        status: "pending",
        evidence: [{ id: "artifact-1", type: "artifact", title: "demo/agent-tools", reason: "Repo evidence." }]
      },
      {
        type: "project",
        text: "Builds agent tools",
        confidence: 0.84,
        status: "approved",
        evidence: [{ id: "artifact-1", type: "artifact", title: "demo/agent-tools", reason: "Repo evidence." }]
      }
    ]);
    await expect(store.updateClaim(claims[0]?.id ?? "missing", { status: "rejected" })).resolves.toMatchObject({
      status: "rejected"
    });
    await expect(store.listProfileClaims("demo")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "TypeScript", status: "rejected" }),
      expect.objectContaining({ text: "Builds agent tools", status: "approved" })
    ]));

    const cards = await store.listCards("demo");
    await expect(store.updateCard(cards?.[0]?.id ?? "missing", { visibility: "private" })).resolves.toMatchObject({
      visibility: "private"
    });
    await expect(store.listCards("demo")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ visibility: "private" })
    ]));

    await expect(store.saveProfileSources("demo", [
      { id: "source-run-1", runId: "run-1", type: "website", url: "https://example.com", status: "completed" }
    ])).resolves.toHaveLength(1);
    await expect(store.listProfileSources("run-1")).resolves.toEqual([
      expect.objectContaining({ id: "source-run-1", personId: "demo" })
    ]);
    await expect(store.listProfileSourcesForHandle("demo")).resolves.toEqual([
      expect.objectContaining({ id: "source-run-1", personId: "demo" })
    ]);
    await expect(store.getProfile("demo")).resolves.toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({ type: "github", url: "https://github.com/demo", externalId: "123" }),
        expect.objectContaining({ type: "website", url: "https://example.com" })
      ])
    });
  });
});
