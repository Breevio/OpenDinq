import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api";

describe("apiRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("turns schema validation JSON into product-facing copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: {
            code: "bad_request",
            message: JSON.stringify([
              {
                code: "too_small",
                minimum: 1,
                type: "string",
                inclusive: true,
                exact: false,
                message: "String must contain at least 1 character(s)",
                path: ["input"]
              }
            ])
          }
        })
      }))
    );

    await expect(apiRequest("/api/import/github", { method: "POST" })).rejects.toThrow(
      "Enter a search input, public source, or profile URL."
    );
  });
});
