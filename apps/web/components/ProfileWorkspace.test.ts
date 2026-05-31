import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "ProfileWorkspace.tsx"), "utf8");

describe("workspace framing", () => {
  it("uses product-facing workspace copy instead of local alpha disclaimers", () => {
    expect(source).toContain(">Workspace<");
    expect(source).toContain("Publishing updates the public profile view for this local workspace.");
    expect(source).not.toContain("Local alpha workspace");
    expect(source).not.toContain("not an auth or ownership boundary");
  });

  it("uses product-facing review and editing labels instead of admin jargon", () => {
    expect(source).toContain("Review progress");
    expect(source).toContain("Verified details");
    expect(source).toContain("Details to review");
    expect(source).toContain("Published profile");
    expect(source).toContain("Draft profile");
    expect(source).toContain("Search related profiles");
    expect(source).toContain("function readableSourceType");
    expect(source).toContain('return "Imported"');
    expect(source).toContain('return "Needs review"');
    expect(source).toContain('return "Import issue"');
    expect(source).toContain("Mark verified");
    expect(source).toContain("Remove from profile");
    expect(source).toContain("Keep for review");
    expect(source).toContain("Visible on profile");
    expect(source).toContain("Private to workspace");
    expect(source).toContain("Save changes");
    expect(source).toContain("Move earlier");
    expect(source).toContain("Move later");
    expect(source).toContain("Refresh from sources");
    expect(source).toContain("Add note card");
    expect(source).not.toContain("Evidence-backed claims");
    expect(source).not.toContain("User-provided claims");
    expect(source).not.toContain("Discover preview");
    expect(source).not.toContain("% confidence");
    expect(source).not.toContain("Approve");
    expect(source).not.toContain("Reject");
    expect(source).not.toContain("Mark pending");
    expect(source).not.toContain("Profile readiness");
    expect(source).not.toContain(">Move up<");
    expect(source).not.toContain(">Move down<");
    expect(source).not.toContain(">Regenerate<");
    expect(source).not.toContain(">Create manual note card<");
  });
});
