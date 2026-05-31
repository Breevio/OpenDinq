import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "GitHubRecoveryPanel.tsx"), "utf8");

describe("GitHubRecoveryPanel", () => {
  it("turns raw recovery advice into a product-facing recovery flow", () => {
    expect(source).toContain("GitHub imports can be stronger");
    expect(source).toContain("Current result is still reviewable");
    expect(source).toContain("Add a GitHub token for richer data");
    expect(source).toContain("Retry this action");
    expect(source).toContain("<summary>Improve local GitHub imports</summary>");
    expect(source).toContain("GITHUB_TOKEN=YOUR_TOKEN");
    expect(source).toContain("fresher and more complete GitHub evidence");
  });

  it("supports an explicit retry action button", () => {
    expect(source).toContain("onRetry");
    expect(source).toContain("retryLabel ?? \"Retry\"");
  });
});
