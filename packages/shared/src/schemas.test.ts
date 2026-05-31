import { describe, expect, it } from "vitest";
import {
  artifactSchema,
  cardSchema,
  evidenceRefSchema,
  identitySourceSchema,
  personSchema,
  searchResultSchema
} from "./schemas.js";

const evidence = {
  id: "repo-1",
  type: "artifact",
  title: "agent-tools",
  url: "https://github.com/example/agent-tools",
  reason: "Repository topic includes mcp"
} as const;

describe("OpenDinq domain schemas", () => {
  it("validates a person profile", () => {
    expect(
      personSchema.parse({
        handle: "demo-agent-builder",
        displayName: "Demo Agent Builder",
        avatarUrl: "https://example.com/avatar.png"
      })
    ).toMatchObject({ handle: "demo-agent-builder" });
  });

  it("requires source URLs to be valid", () => {
    expect(() =>
      identitySourceSchema.parse({
        type: "github",
        url: "github.com/demo"
      })
    ).toThrow();
  });

  it("limits artifacts to supported types", () => {
    expect(
      artifactSchema.parse({
        type: "repo",
        title: "agent-tools",
        url: "https://github.com/example/agent-tools"
      })
    ).toMatchObject({ type: "repo" });
  });

  it("requires cards to include evidence", () => {
    expect(() =>
      cardSchema.parse({
        type: "summary",
        title: "Summary",
        contentMd: "Builds agent tools.",
        evidence: []
      })
    ).toThrow();
  });

  it("requires search results to include explanation and evidence", () => {
    expect(
      searchResultSchema.parse({
        person: {
          handle: "demo-agent-builder",
          displayName: "Demo Agent Builder"
        },
        score: 0.8,
        explanation: "Matched TypeScript and MCP evidence.",
        evidence: [evidenceRefSchema.parse(evidence)]
      })
    ).toMatchObject({ score: 0.8 });
  });

  it("rejects unsupported artifact types", () => {
    expect(() =>
      artifactSchema.parse({
        type: "resume",
        title: "Resume"
      })
    ).toThrow();
  });
});

