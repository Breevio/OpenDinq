import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

describe("/import page framing", () => {
  it("presents GitHub import as a current product entry instead of a deprecated flow", () => {
    expect(source).toContain("Bring in GitHub evidence.");
    expect(source).toContain("Import public activity into a reviewable profile.");
    expect(source).toContain("<AppNav />");
    expect(source).not.toContain("Legacy GitHub import");
    expect(source).not.toContain("Use Generate for multi-source profile generation.");
  });
});
