import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenDinqApiClient } from "./api-client.js";

describe("OpenDinq API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the expected API routes for profile tools", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const client = createOpenDinqApiClient("http://localhost:3011/");

    await expect(client.importGitHubProfile("demo")).resolves.toEqual({ ok: true });
    await expect(client.getProfileRun("run/1")).resolves.toEqual({ ok: true });
    await expect(client.listCards("demo/user")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:3011/api/import/github", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ input: "demo" })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:3011/api/profile-runs/run%2F1", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:3011/api/people/demo%2Fuser/cards", expect.any(Object));
  });

  it("extracts public profile evidence for the get_evidence tool", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      person: { handle: "demo" },
      sources: [{ type: "github", url: "https://github.com/demo" }],
      artifacts: [{ id: "repo-1", title: "demo/repo" }],
      cards: [{ evidence: [{ id: "card-evidence", type: "artifact", title: "demo/repo", reason: "Repo evidence." }] }],
      claims: [{ evidence: [{ id: "claim-evidence", type: "artifact", title: "demo/repo", reason: "Claim evidence." }] }]
    })));
    const client = createOpenDinqApiClient("http://localhost:3011");

    await expect(client.getEvidence("demo")).resolves.toMatchObject({
      person: { handle: "demo" },
      sources: [{ type: "github" }],
      artifacts: [{ id: "repo-1" }],
      cardEvidence: [{ id: "card-evidence" }],
      claimEvidence: [{ id: "claim-evidence" }]
    });
  });

  it("throws API error messages from failed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      error: {
        code: "not_found",
        message: "Person was not found."
      }
    }, { status: 404 })));
    const client = createOpenDinqApiClient("http://localhost:3011");

    await expect(client.listCards("missing")).rejects.toThrow("Person was not found.");
  });
});
