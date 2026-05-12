import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "DiscoverSearch.tsx"), "utf8");
const styles = readFileSync(resolve(__dirname, "../app/styles.css"), "utf8");

describe("/discover people card UI", () => {
  it("renders search results as profile-style cards with visual identity and metrics", () => {
    expect(source).toContain("people-card");
    expect(source).toContain("people-card-hero");
    expect(source).toContain("people-card-avatar");
    expect(source).toContain("people-card-metric");
    expect(source).toContain("Evidence signals");
    expect(source).toContain("Match");
  });

  it("keeps source evidence visible inside each card", () => {
    expect(source).toContain("people-card-evidence");
    expect(source).toContain("EvidenceList");
    expect(source).toContain("matchedArtifacts");
    expect(source).toContain("matchedClaims");
  });

  it("defines responsive card styles instead of the old list-only layout", () => {
    expect(styles).toContain(".people-card");
    expect(styles).toContain(".people-card-hero");
    expect(styles).toContain(".people-card-metric");
    expect(styles).toContain("grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))");
  });
});
