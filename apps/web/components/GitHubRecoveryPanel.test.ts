import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "GitHubRecoveryPanel.tsx"), "utf8");

describe("GitHubRecoveryPanel", () => {
  it("turns raw recovery advice into a product-facing recovery flow", () => {
    expect(source).toContain("lucide-react");
    expect(source).toContain("GitHub import limited");
    expect(source).toContain("AlertTriangle");
    expect(source).toContain("RefreshCw");
    expect(source).toContain("<summary>Improve local GitHub imports</summary>");
    expect(source).toContain("GITHUB_TOKEN=YOUR_TOKEN");
    expect(source).toContain("fresher and more complete GitHub evidence");
    expect(source).not.toContain("<svg className=\"ui-icon\"");
  });

  it("supports an explicit retry action button", () => {
    expect(source).toContain("onRetry");
    expect(source).toContain("retryLabel ?? \"Retry\"");
  });
});
