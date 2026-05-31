import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

describe("home page entry points", () => {
  it("uses search-first product entry points instead of a demo profile link", () => {
    expect(source).toContain("Find people with proof.");
    expect(source).toContain("<img src=\"/opendinq-logo-web.png\" alt=\"OpenDinq\" />");
    expect(source).toContain("action=\"/generate\"");
    expect(source).toContain("Verify the match before OpenDinq builds the profile.");
    expect(source).toContain("Name, GitHub handle, paper, or public URL");
    expect(source).toContain(">Search<");
    expect(source).toContain("<Link href=\"/generate\">Generate profile</Link>");
    expect(source).toContain("<Link href=\"/import\">Import GitHub</Link>");
    expect(source).toContain("home-product-card");
    expect(source).toContain("Only shown with evidence");
    expect(source).not.toContain("Evidence-backed people search");
    expect(source).not.toContain("Public-source search");
    expect(source).not.toContain("Evidence review");
    expect(source).not.toContain("Profile generation");
    expect(source).not.toContain("View Demo Profile");
    expect(source).not.toContain("/u/demo-agent-builder");
  });
});
