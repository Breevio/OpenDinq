export type OpenDinqApiClient = {
  generateProfile(input: unknown): Promise<unknown>;
  getProfileRun(runId: string): Promise<unknown>;
  importGitHubProfile(input: string): Promise<unknown>;
  searchPeople(query: string): Promise<unknown>;
  getPersonProfile(handle: string): Promise<unknown>;
  getProfileWorkspace(handle: string): Promise<unknown>;
  getEvidence(handle: string): Promise<unknown>;
  listCards(handle: string): Promise<unknown>;
  createNoteCard(handle: string, title: string, contentMd: string): Promise<unknown>;
  updateClaim(claimId: string, patch: unknown): Promise<unknown>;
  updateCard(cardId: string, patch: unknown): Promise<unknown>;
  regenerateCard(cardId: string): Promise<unknown>;
  publishProfile(handle: string, publicStatus: "draft" | "published"): Promise<unknown>;
};

export function createOpenDinqApiClient(apiUrl = requiredApiUrl()): OpenDinqApiClient {
  const baseUrl = apiUrl.replace(/\/$/, "");

  return {
    generateProfile(input) {
      return request(`${baseUrl}/api/profiles/generate`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    getProfileRun(runId) {
      return request(`${baseUrl}/api/profile-runs/${encodeURIComponent(runId)}`);
    },
    importGitHubProfile(input) {
      return request(`${baseUrl}/api/import/github`, {
        method: "POST",
        body: JSON.stringify({ input })
      });
    },
    searchPeople(query) {
      return request(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
    },
    getPersonProfile(handle) {
      return request(`${baseUrl}/api/people/${encodeURIComponent(handle)}`);
    },
    getProfileWorkspace(handle) {
      return request(`${baseUrl}/api/people/${encodeURIComponent(handle)}/workspace`);
    },
    async getEvidence(handle) {
      const profile = await request(`${baseUrl}/api/people/${encodeURIComponent(handle)}`);
      return extractEvidence(profile);
    },
    listCards(handle) {
      return request(`${baseUrl}/api/people/${encodeURIComponent(handle)}/cards`);
    },
    createNoteCard(handle, title, contentMd) {
      return request(`${baseUrl}/api/people/${encodeURIComponent(handle)}/cards/manual-note`, {
        method: "POST",
        body: JSON.stringify({ title, contentMd })
      });
    },
    updateClaim(claimId, patch) {
      return request(`${baseUrl}/api/claims/${encodeURIComponent(claimId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
    },
    updateCard(cardId, patch) {
      return request(`${baseUrl}/api/cards/${encodeURIComponent(cardId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
    },
    regenerateCard(cardId) {
      return request(`${baseUrl}/api/cards/${encodeURIComponent(cardId)}/regenerate`, { method: "POST" });
    },
    publishProfile(handle, publicStatus) {
      return request(`${baseUrl}/api/people/${encodeURIComponent(handle)}/publish`, {
        method: "PATCH",
        body: JSON.stringify({ publicStatus })
      });
    }
  };
}

async function request(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.error?.message ?? `OpenDinq API request failed with ${response.status}.`;
    throw new Error(message);
  }

  return body;
}

function extractEvidence(profile: unknown) {
  const record = profile as {
    person?: { handle?: string; displayName?: string };
    sources?: unknown[];
    artifacts?: unknown[];
    cards?: Array<{ evidence?: unknown[] }>;
    claims?: Array<{ evidence?: unknown[] }>;
  };

  return {
    person: record.person,
    sources: record.sources ?? [],
    artifacts: record.artifacts ?? [],
    claims: record.claims ?? [],
    cardEvidence: (record.cards ?? []).flatMap((card) => card.evidence ?? []),
    claimEvidence: (record.claims ?? []).flatMap((claim) => claim.evidence ?? [])
  };
}

function requiredApiUrl(): string {
  const apiUrl = process.env.OPENDINQ_API_URL;
  if (!apiUrl) {
    throw new Error("OPENDINQ_API_URL is required for the OpenDinq MCP server.");
  }

  return apiUrl;
}
