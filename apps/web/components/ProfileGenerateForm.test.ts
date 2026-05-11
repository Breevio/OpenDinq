import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ProfileGenerateForm.tsx"), "utf8");

describe("/generate search-first UI", () => {
  it("uses a single primary input and candidate preview action", () => {
    expect(source).toContain("Profile generation input");
    expect(source).toContain("Search a person, describe them, or paste a source");
    expect(source).toContain("Preview candidates");
    expect(source).toContain("/api/profiles/resolve");
    expect(source).toContain("/api/profiles/search-and-generate");
  });

  it("keeps advanced source fields collapsed", () => {
    expect(source).toContain("<details className=\"advanced-sources\">");
    expect(source).toContain("<summary>Advanced sources</summary>");
    expect(source).toContain("/api/profiles/generate");
  });

  it("renders candidate resolution and selected candidate generation", () => {
    expect(source).toContain("Candidate requires confirmation");
    expect(source).toContain("Generate this profile");
    expect(source).toContain("/api/profiles/generate-from-candidate");
  });
});
