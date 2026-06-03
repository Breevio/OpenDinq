import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "DiscoverSearch.tsx"), "utf8");

describe("/discover search UI", () => {
  it("runs the initial q parameter search from generated profile links", () => {
    expect(source).toContain("useEffect");
    expect(source).toContain("new URLSearchParams(window.location.search).get(\"q\")");
    expect(source).toContain("void runSearch(initialQuery)");
    expect(source).toContain("/api/search?q=");
  });

  it("starts from an empty, product-facing search state instead of an internal demo query", () => {
    expect(source).toContain("return \"\";");
    expect(source).toContain("Search profiles");
    expect(source).toContain("placeholder=\"Search by skill, role, claim, artifact, or topic\"");
    expect(source).toContain("open-source infrastructure");
    expect(source).not.toContain("AI agent TypeScript MCP");
    expect(source).not.toContain("AI agent builders with TypeScript and MCP");
  });

  it("uses product-facing result copy instead of raw scoring diagnostics", () => {
    expect(source).toContain("discoverResultSummary(result)");
    expect(source).toContain("Best evidence");
    expect(source).toContain("Relevant");
    expect(source).toContain("Review");
    expect(source).toContain("evidence-backed claim");
    expect(source).not.toContain("Profile cards");
    expect(source).not.toContain("Source artifacts");
    expect(source).not.toContain("Strong match");
    expect(source).not.toContain("Good match");
    expect(source).not.toContain("Possible match");
    expect(source).not.toContain("Why matched");
    expect(source).not.toContain("claims {Math.round(result.scoreBreakdown.claimScore * 100)}%");
    expect(source).not.toContain("Matched cards");
    expect(source).not.toContain("Matched artifacts");
  });
});
