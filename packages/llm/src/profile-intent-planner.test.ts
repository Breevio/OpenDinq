import { describe, expect, it, vi } from "vitest";
import { deterministicFallbackPlan, planProfileGeneration, type JsonLlmClient } from "./index.js";

describe("LLM profile intent planner", () => {
  it("maps a GitHub URL to a GitHub source", async () => {
    expect(deterministicFallbackPlan("https://github.com/torvalds").sources[0]).toMatchObject({ type: "github", input: "torvalds" });
  });

  it("maps a plain GitHub username to a GitHub source", async () => {
    expect(deterministicFallbackPlan("torvalds").sources[0]).toMatchObject({ type: "github", input: "torvalds" });
  });

  it("maps a website URL to a website source", async () => {
    expect(deterministicFallbackPlan("https://example.com/about").sources[0]).toMatchObject({ type: "website", input: "https://example.com/about" });
  });

  it("maps ORCID, arXiv, and OpenAlex ids to their sources", () => {
    expect(deterministicFallbackPlan("0000-0002-1825-0097").sources[0]?.type).toBe("orcid");
    expect(deterministicFallbackPlan("2401.12345").sources[0]?.type).toBe("arxiv");
    expect(deterministicFallbackPlan("A123456789").sources[0]?.type).toBe("openalex");
  });

  it("uses natural language as a manual evidence seed", () => {
    const plan = deterministicFallbackPlan("Generate a profile for Linus Torvalds");

    expect(plan.intent).toBe("manual_profile");
    expect(plan.inferredPerson.displayName).toBe("Linus Torvalds");
    expect(plan.sources[0]).toMatchObject({ type: "manual" });
    expect(plan.warnings[0]).toContain("No public source URL");
  });

  it("uses valid mocked LLM JSON", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Generate a profile from https://example.com/about",
        intent: "generate_profile",
        confidence: 0.9,
        inferredPerson: { displayName: "Example Person" },
        sources: [{ type: "website", input: "https://example.com/about", reason: "URL provided", confidence: 0.9 }],
        manualNotes: [],
        searchQueries: [],
        warnings: [],
        questions: []
      })
    };

    await expect(planProfileGeneration("Generate a profile from https://example.com/about", { client })).resolves.toMatchObject({
      sources: [expect.objectContaining({ type: "website" })]
    });
  });

  it("falls back on invalid LLM JSON", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({ nope: true })
    };

    const plan = await planProfileGeneration("torvalds", { client });

    expect(plan.sources[0]).toMatchObject({ type: "github", input: "torvalds" });
    expect(plan.warnings[0]).toContain("LLM planning failed");
  });

  it("rejects hallucinated unsupported URLs", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Generate a profile for Ada",
        intent: "generate_profile",
        confidence: 0.8,
        inferredPerson: { displayName: "Ada" },
        sources: [{ type: "website", input: "https://invented.example/ada", reason: "Guessed", confidence: 0.8 }],
        manualNotes: [{ text: "Generate a profile for Ada", reason: "Original request" }],
        searchQueries: [],
        warnings: [],
        questions: []
      })
    };

    const plan = await planProfileGeneration("Generate a profile for Ada", { client });

    expect(plan.sources).toHaveLength(0);
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Rejected hallucinated source URL")]));
  });
});
