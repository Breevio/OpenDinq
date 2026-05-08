import { describe, expect, it, vi } from "vitest";
import { createToolHandlers, MCP_TOOL_PLAN, textResult } from "./tools.js";
import type { OpenDinqApiClient } from "./api-client.js";

describe("OpenDinq MCP tools", () => {
  it("exposes the planned tool names", () => {
    expect(MCP_TOOL_PLAN).toEqual([
      "opendinq_import_github_profile",
      "opendinq_search_people",
      "opendinq_get_person_profile",
      "opendinq_get_evidence",
      "opendinq_list_cards",
      "opendinq_create_note_card"
    ]);
  });

  it("forwards tool calls to the OpenDinq API client", async () => {
    const client = mockClient();
    const tools = createToolHandlers(client);

    await expect(tools.opendinq_search_people({ query: "AI agent TypeScript MCP" })).resolves.toMatchObject({ results: [] });
    await expect(tools.opendinq_get_evidence({ handle: "demo" })).resolves.toMatchObject({ artifacts: [] });
    await expect(tools.opendinq_create_note_card({ handle: "demo", title: "Note", contentMd: "Body" })).resolves.toMatchObject({
      handle: "demo"
    });

    expect(client.searchPeople).toHaveBeenCalledWith("AI agent TypeScript MCP");
    expect(client.getEvidence).toHaveBeenCalledWith("demo");
    expect(client.createNoteCard).toHaveBeenCalledWith("demo", "Note", "Body");
  });

  it("formats MCP text results as JSON", () => {
    expect(textResult({ ok: true })).toEqual({
      content: [
        {
          type: "text",
          text: "{\n  \"ok\": true\n}"
        }
      ]
    });
  });
});

function mockClient(): OpenDinqApiClient {
  return {
    importGitHubProfile: vi.fn().mockResolvedValue({ handle: "demo" }),
    searchPeople: vi.fn().mockResolvedValue({ results: [] }),
    getPersonProfile: vi.fn().mockResolvedValue({ person: { handle: "demo" } }),
    getEvidence: vi.fn().mockResolvedValue({ artifacts: [] }),
    listCards: vi.fn().mockResolvedValue({ cards: [] }),
    createNoteCard: vi.fn().mockResolvedValue({ handle: "demo" })
  };
}
