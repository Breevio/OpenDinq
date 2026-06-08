import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ProfileView.tsx"), "utf8");

describe("public profile card visibility", () => {
  it("renders and scores only public or legacy-visible cards", () => {
    expect(source).toContain("function publicProfileCards");
    expect(source).toContain("card.visibility === undefined || card.visibility === \"public\"");
    expect(source).not.toContain("card.visibility !== \"hidden\"");
    expect(source).toContain("publicProfileCards(profile).map");
    expect(source).toContain("publicProfileCards(profile).flatMap");
    expect(source).toContain("function visibleClaims(profile: PersonProfile)");
    expect(source).toContain("CardContent");
    expect(source).toContain("stripInlineMarkdown");
    expect(source).not.toContain("<pre>{card.contentMd}</pre>");
    expect(source).not.toContain("% complete");
    expect(source).toContain("Published profile");
    expect(source).toContain("Draft profile");
    expect(source).toContain("Copy profile link");
    expect(source).toContain("function readableSourceType");
    expect(source).toContain("function readableArtifactType");
    expect(source).toContain("ID ${source.externalId}");
    expect(source).toContain("Linked source");
    expect(source).toContain("function readableCardType");
    expect(source).toContain("function readableClaimType");
    expect(source).not.toContain("<small>{claim.confidence}</small>");
    expect(source).not.toContain("{card.confidence}");
  });

  it("cleans generator-style public card prose into readable blocks", () => {
    expect(source).toContain("function CardContent({ card }");
    expect(source).toContain("function cardBlocks(card:");
    expect(source).toContain("function expandInlineSeries(block: string, cardTitle: string)");
    expect(source).toContain("function cleanCardLine(value: string)");
    expect(source).toContain(".replace(/^(profile|skills|selected works|timeline)\\s*[:\\-]\\s*/i, \"\")");
    expect(source).toContain(".replace(/\\((?:\\d+% confidence(?:,\\s*evidence:[^)]+)?|confidence:[^)]+|evidence:[^)]+)\\)/gi, \"\")");
    expect(source).toContain(".replace(/,\\s*evidence:\\s*.+$/i, \"\")");
    expect(source).toContain("rest.split(/\\s+-\\s+/)");
    expect(source).not.toContain("<p key={index}>{stripInlineMarkdown(block)}</p>");
  });

  it("filters malformed claim payloads before rendering the public profile", () => {
    expect(source).toContain("const claims = visibleClaims(profile);");
    expect(source).toContain("return (profile.claims ?? [])");
    expect(source).toContain(".filter((claim): claim is");
    expect(source).toContain("typeof claim.type === \"string\"");
    expect(source).toContain("typeof claim.text === \"string\"");
    expect(source).toContain("Array.isArray(claim.evidence)");
    expect(source).toContain("const seenClaims = new Set<string>();");
    expect(source).toContain("function claimKey(claim:");
    expect(source).toContain("key={claimKey(claim, index)}");
    expect(source).not.toContain("key={claim.id ?? claim.text}");
  });
});
