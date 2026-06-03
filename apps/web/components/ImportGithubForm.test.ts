import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ImportGithubForm.tsx"), "utf8");

describe("/import GitHub UI", () => {
  it("redirects degraded imports to the workspace review flow", () => {
    expect(source).toContain("imported.status === \"needs_review\" || imported.warnings.length > 0");
    expect(source).toContain("window.location.assign(imported.workspaceUrl)");
    expect(source).toContain("OpenDinq imported what it could");
    expect(source).toContain("result.recoveryAdvice");
    expect(source).toContain("<GitHubRecoveryPanel advice={result.recoveryAdvice} onRetry={runImport} retryLabel=\"Retry import\" />");
    expect(source).toContain("<a href={result.workspaceUrl}>Open workspace</a>");
  });

  it("keeps the clean import success state for completed imports", () => {
    expect(source).toContain("result.status === \"completed\" && result.warnings.length === 0");
    expect(source).toContain("<a href={result.profileUrl}>Open profile</a>");
    expect(source).toContain("{isLoading ? \"Importing\" : \"Import profile\"}");
  });

  it("starts with an empty input instead of a demo handle", () => {
    expect(source).toContain("useState(\"\")");
    expect(source).not.toContain("demo-agent-builder");
  });

  it("shows a readable required-input error before calling the API", () => {
    expect(source).toContain("const normalizedInput = input.trim()");
    expect(source).toContain("Enter a GitHub username or profile URL.");
    expect(source).toContain("body: JSON.stringify({ input: normalizedInput })");
    expect(source).toContain("if (error)");
    expect(source).toContain("setError(null)");
  });
});
