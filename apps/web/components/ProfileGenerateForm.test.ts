import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ProfileGenerateForm.tsx"), "utf8");

describe("/generate AI-first UI", () => {
  it("uses a single primary input and preview plan action", () => {
    expect(source).toContain("Profile generation input");
    expect(source).toContain("Paste a URL, GitHub handle, ORCID, arXiv id, website, or describe the person");
    expect(source).toContain("Preview plan");
    expect(source).toContain("/api/profiles/plan");
    expect(source).toContain("/api/profiles/generate-ai");
  });

  it("keeps advanced source fields collapsed", () => {
    expect(source).toContain("<details className=\"advanced-sources\">");
    expect(source).toContain("<summary>Advanced sources</summary>");
    expect(source).toContain("/api/profiles/generate");
  });

  it("shows no-key fallback messaging from API results", () => {
    expect(source).toContain("Deterministic fallback");
    expect(source).toContain("LLM used");
  });
});
