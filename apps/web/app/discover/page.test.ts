import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

describe("/discover page framing", () => {
  it("uses product-facing discover copy instead of internal retrieval wording", () => {
    expect(source).toContain("Find profiles by evidence.");
    expect(source).toContain("Search verified claims, source artifacts, cards, and skills");
    expect(source).toContain("<AppNav />");
    expect(source).not.toContain("Search people by public work evidence");
    expect(source).not.toContain("Results combine rule-based and full-text signals");
  });
});
