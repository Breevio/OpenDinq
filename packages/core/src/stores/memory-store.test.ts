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
      cards: [expect.objectContaining({ type: "summary", visibility: "public" })]
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
});
