import type { OpenDinqApiClient } from "./api-client.js";

export const MCP_TOOL_PLAN = [
  "opendinq_generate_profile",
  "opendinq_get_profile_run",
  "opendinq_import_github_profile",
  "opendinq_search_people",
  "opendinq_get_profile_workspace",
  "opendinq_get_profile",
  "opendinq_get_person_profile",
  "opendinq_get_evidence",
  "opendinq_list_cards",
  "opendinq_create_note_card",
  "opendinq_update_claim",
  "opendinq_update_card",
  "opendinq_regenerate_card",
  "opendinq_publish_profile"
] as const;

export function createToolHandlers(client: OpenDinqApiClient) {
  return {
    opendinq_generate_profile: (input: unknown) => client.generateProfile(input),
    opendinq_get_profile_run: ({ runId }: { runId: string }) => client.getProfileRun(runId),
    opendinq_import_github_profile: ({ input }: { input: string }) => client.importGitHubProfile(input),
    opendinq_search_people: ({ query }: { query: string }) => client.searchPeople(query),
    opendinq_get_profile_workspace: ({ handle }: { handle: string }) => client.getProfileWorkspace(handle),
    opendinq_get_profile: ({ handle }: { handle: string }) => client.getPersonProfile(handle),
    opendinq_get_person_profile: ({ handle }: { handle: string }) => client.getPersonProfile(handle),
    opendinq_get_evidence: ({ handle }: { handle: string }) => client.getEvidence(handle),
    opendinq_list_cards: ({ handle }: { handle: string }) => client.listCards(handle),
    opendinq_create_note_card: ({ handle, title, contentMd }: { handle: string; title: string; contentMd: string }) =>
      client.createNoteCard(handle, title, contentMd),
    opendinq_update_claim: ({ claimId, patch }: { claimId: string; patch: unknown }) => client.updateClaim(claimId, patch),
    opendinq_update_card: ({ cardId, patch }: { cardId: string; patch: unknown }) => client.updateCard(cardId, patch),
    opendinq_regenerate_card: ({ cardId }: { cardId: string }) => client.regenerateCard(cardId),
    opendinq_publish_profile: ({ handle, publicStatus }: { handle: string; publicStatus: "draft" | "published" }) =>
      client.publishProfile(handle, publicStatus)
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
