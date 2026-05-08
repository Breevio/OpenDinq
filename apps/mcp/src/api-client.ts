export type OpenDinqApiClient = {
  importGitHubProfile(input: string): Promise<unknown>;
  searchPeople(query: string): Promise<unknown>;
  getPersonProfile(handle: string): Promise<unknown>;
  listCards(handle: string): Promise<unknown>;
  createNoteCard(handle: string, title: string, contentMd: string): Promise<unknown>;
};

export function createOpenDinqApiClient(apiUrl = requiredApiUrl()): OpenDinqApiClient {
  const baseUrl = apiUrl.replace(/\/$/, "");

  return {
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
    listCards(handle) {
      return request(`${baseUrl}/api/cards/${encodeURIComponent(handle)}`);
    },
    createNoteCard(handle, title, contentMd) {
      return request(`${baseUrl}/api/cards/${encodeURIComponent(handle)}/note`, {
        method: "POST",
        body: JSON.stringify({ title, contentMd })
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

function requiredApiUrl(): string {
  const apiUrl = process.env.OPENDINQ_API_URL;
  if (!apiUrl) {
    throw new Error("OPENDINQ_API_URL is required for the OpenDinq MCP server.");
  }

  return apiUrl;
}
