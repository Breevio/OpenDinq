import type { OpenDinqApiClient } from "./api-client.js";

export const MCP_TOOL_PLAN = [
  "import_github_profile",
  "search_people",
  "get_person_profile",
  "list_cards",
  "create_note_card"
] as const;

export function createToolHandlers(client: OpenDinqApiClient) {
  return {
    import_github_profile: ({ input }: { input: string }) => client.importGitHubProfile(input),
    search_people: ({ query }: { query: string }) => client.searchPeople(query),
    get_person_profile: ({ handle }: { handle: string }) => client.getPersonProfile(handle),
    list_cards: ({ handle }: { handle: string }) => client.listCards(handle),
    create_note_card: ({ handle, title, contentMd }: { handle: string; title: string; contentMd: string }) =>
      client.createNoteCard(handle, title, contentMd)
  };
}

export function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}
