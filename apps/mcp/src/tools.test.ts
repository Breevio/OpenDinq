import { describe, expect, it, vi } from "vitest";
import { createToolHandlers, MCP_TOOL_PLAN, textResult } from "./tools.js";
import type { OpenDinqApiClient } from "./api-client.js";

describe("OpenDinq MCP tools", () => {
  it("exposes the planned tool names", () => {
    expect(MCP_TOOL_PLAN).toEqual([
      "import_github_profile",
      "search_people",
      "get_person_profile",
      "list_cards",
      "create_note_card"
    ]);
  });

  it("forwards tool calls to the OpenDinq API client", async () => {
    const client = mockClient();
    const tools = createToolHandlers(client);

    await expect(tools.search_people({ query: "AI agent TypeScript MCP" })).resolves.toMatchObject({ results: [] });
    await expect(tools.create_note_card({ handle: "demo", title: "Note", contentMd: "Body" })).resolves.toMatchObject({
      handle: "demo"
    });

    expect(client.searchPeople).toHaveBeenCalledWith("AI agent TypeScript MCP");
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
    listCards: vi.fn().mockResolvedValue({ cards: [] }),
    createNoteCard: vi.fn().mockResolvedValue({ handle: "demo" })
  };
}
