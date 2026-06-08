import { describe, expect, it, vi } from "vitest";
import { deterministicFallbackPlan, planProfileGeneration, type JsonLlmClient } from "./index.js";

describe("LLM profile intent planner", () => {
  it("maps explicit source inputs to explicit sources", () => {
    expect(deterministicFallbackPlan("https://github.com/torvalds").sources[0]).toMatchObject({ type: "github", input: "torvalds", evidenceStatus: "explicit" });
    expect(deterministicFallbackPlan("torvalds").sources[0]).toMatchObject({ type: "github", input: "torvalds", evidenceStatus: "explicit" });
    expect(deterministicFallbackPlan("https://example.com/about").sources[0]).toMatchObject({ type: "website", input: "https://example.com/about", evidenceStatus: "explicit" });
    expect(deterministicFallbackPlan("0000-0002-1825-0097").sources[0]?.type).toBe("orcid");
    expect(deterministicFallbackPlan("2401.12345").sources[0]?.type).toBe("arxiv");
    expect(deterministicFallbackPlan("A123456789").sources[0]?.type).toBe("openalex");
  });

  it("uses natural language as user-provided evidence seed", () => {
    const plan = deterministicFallbackPlan("Generate a profile for Linus Torvalds");

    expect(plan).toMatchObject({
      intent: "manual_profile",
      subject: { displayName: "Linus Torvalds", handle: "linus-torvalds" },
      sources: [expect.objectContaining({ type: "manual", evidenceStatus: "user_provided" })],
      userProvidedClaims: [expect.objectContaining({ evidenceStatus: "user_provided" })]
    });
    expect(plan.missingEvidence).toEqual(expect.arrayContaining([expect.objectContaining({ need: expect.stringContaining("Public evidence") })]));
  });

  it("does not treat GitHub activity wording as an explicit GitHub handle", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Research torvalds and generate evidence-backed profile cards from public GitHub activity",
        intent: "generate_profile",
        confidence: 0.8,
        subject: { displayName: "activity", handle: "activity" },
        sources: [{ type: "github", input: "activity", reason: "Misread GitHub activity as a handle", confidence: 0.8, evidenceStatus: "explicit" }],
        userProvidedClaims: [{ text: "Research torvalds and generate evidence-backed profile cards from public GitHub activity", type: "summary", confidence: 0.5, evidenceStatus: "user_provided" }],
        missingEvidence: [],
        warnings: [],
        questions: []
      })
    };

    const plan = await planProfileGeneration("Research torvalds and generate evidence-backed profile cards from public GitHub activity", { client });

    expect(plan.intent).toBe("manual_profile");
    expect(plan.sources).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "github", input: "activity" })]));
    expect(plan.subject).toMatchObject({ displayName: "Torvalds", handle: "torvalds" });
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Ignored github source because it was not explicitly provided")]));
  });

  it("uses valid mocked LLM JSON", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Generate a profile from https://example.com/about",
        intent: "generate_profile",
        confidence: 0.9,
        subject: { displayName: "Example Person" },
        sources: [{ type: "website", input: "https://example.com/about", reason: "URL provided", confidence: 0.9, evidenceStatus: "explicit" }],
        userProvidedClaims: [],
        missingEvidence: [],
        warnings: [],
        questions: []
      })
    };

    await expect(planProfileGeneration("Generate a profile from https://example.com/about", { client })).resolves.toMatchObject({
      sources: [expect.objectContaining({ type: "website", evidenceStatus: "explicit" })]
    });
  });

  it("uses local fallback when LLM is unavailable", async () => {
    const plan = await planProfileGeneration("jiajun wu");

    expect(plan).toMatchObject({ intent: "manual_profile", subject: { displayName: "Jiajun Wu" } });
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.stringContaining("LLM generation is not configured")]));
  });

  it("falls back on invalid LLM JSON with friendly copy", async () => {
    const client: JsonLlmClient = { completeJson: vi.fn().mockResolvedValue({ nope: true }) };

    const plan = await planProfileGeneration("torvalds", { client });

    expect(plan.sources[0]).toMatchObject({ type: "github", input: "torvalds" });
    expect(plan.warnings[0]).toContain("Could not parse LLM plan");
  });

  it("coerces provider-specific JSON into the OpenDinq plan schema", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        person: { names: [{ fullName: "Linus Torvalds" }], domains: ["Software Engineering", "Operating Systems"] },
        sources: [{ type: "github", url: "https://github.com/torvalds" }]
      })
    };

    const plan = await planProfileGeneration("https://github.com/torvalds", { client });

    expect(plan).toMatchObject({
      intent: "generate_profile",
      subject: { displayName: "Linus Torvalds", headline: "Software Engineering, Operating Systems" },
      sources: [expect.objectContaining({ type: "github", input: "torvalds", evidenceStatus: "explicit" })]
    });
  });

  it("coerces GLM-style planner JSON into the OpenDinq plan schema", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "https://github.com/torvalds",
        intent: "generate_profile",
        confidence: 0.95,
        subject: "torvalds",
        sources: [{ type: "github", value: "https://github.com/torvalds", evidenceStatus: "explicit" }],
        userProvidedClaims: [],
        missingEvidence: [{ claim: "Professional affiliation", suggestion: "Add a public website or OpenAlex profile" }],
        questions: [],
        warnings: []
      })
    };

    const plan = await planProfileGeneration("https://github.com/torvalds", { client });

    expect(plan).toMatchObject({
      intent: "generate_profile",
      subject: { displayName: "torvalds" },
      sources: [expect.objectContaining({ type: "github", input: "torvalds", evidenceStatus: "explicit" })],
      missingEvidence: [expect.objectContaining({ need: "Professional affiliation" })]
    });
  });

  it("coerces GLM string arrays into explicit sources and missing evidence", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "https://github.com/torvalds",
        intent: "VerifyGitHubProfile",
        confidence: 0.5,
        subject: "torvalds",
        sources: ["https://github.com/torvalds"],
        userProvidedClaims: [],
        missingEvidence: ["Specific claims need verification"],
        questions: [],
        warnings: []
      })
    };

    const plan = await planProfileGeneration("https://github.com/torvalds", { client });

    expect(plan).toMatchObject({
      intent: "generate_profile",
      sources: [expect.objectContaining({ type: "github", input: "torvalds", evidenceStatus: "explicit" })],
      missingEvidence: [expect.objectContaining({ need: "Specific claims need verification" })]
    });
  });

  it("keeps person-only JSON as a manual plan", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({ person: { names: [{ fullName: "Jiajun Wu" }] }, sources: [] })
    };

    const plan = await planProfileGeneration("jiajun wu", { client });

    expect(plan).toMatchObject({
      intent: "manual_profile",
      subject: { displayName: "Jiajun Wu" },
      sources: [expect.objectContaining({ type: "manual", evidenceStatus: "user_provided" })]
    });
    expect(plan.warnings.join(" ")).not.toContain("planning failed");
  });

  it("does not surface unsupported organization facts in manual-only warnings", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "jiajun wu",
        intent: "manual_profile",
        confidence: 0.4,
        subject: { displayName: "Jiajun Wu" },
        sources: [],
        userProvidedClaims: [{ text: "jiajun wu", type: "summary", confidence: 0.4, evidenceStatus: "user_provided" }],
        missingEvidence: [],
        questions: [],
        warnings: ["The name may refer to researchers at MIT or Stanford."]
      })
    };

    const plan = await planProfileGeneration("jiajun wu", { client });

    expect(plan.warnings.join(" ")).not.toMatch(/MIT|Stanford/);
    expect(plan.warnings.join(" ")).toContain("public source");
  });

  it("keeps manual-only subjects from expanding into prompt instructions", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Research Zorblatt Q. Unmade and return profile cards.",
        intent: "manual_profile",
        confidence: 0.4,
        subject: {
          displayName: "Zorblatt Q. Unmade And Return Profile Cards Using Public Web Results",
          handle: "zorblatt-q-unmade-and-return-profile-cards-using-public-web-results"
        },
        sources: [],
        userProvidedClaims: [{ text: "Research Zorblatt Q. Unmade and return profile cards.", type: "summary", confidence: 0.4, evidenceStatus: "user_provided" }],
        missingEvidence: [],
        questions: [],
        warnings: ["No public source was provided."]
      })
    };

    const plan = await planProfileGeneration("Research Zorblatt Q. Unmade and return profile cards.", { client });

    expect(plan.subject).toMatchObject({
      displayName: "Zorblatt Q. Unmade",
      handle: "zorblatt-q-unmade"
    });
  });

  it("replaces unrelated short manual subjects with the requested person name", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Research Zorblatt Q. Unmade and return profile cards.",
        intent: "manual_profile",
        confidence: 0.4,
        subject: { displayName: "And Generate A", handle: "and-generate-a" },
        sources: [],
        userProvidedClaims: [{ text: "Research Zorblatt Q. Unmade and return profile cards.", type: "summary", confidence: 0.4, evidenceStatus: "user_provided" }],
        missingEvidence: [],
        questions: [],
        warnings: ["No public source was provided."]
      })
    };

    const plan = await planProfileGeneration("Research Zorblatt Q. Unmade and return profile cards.", { client });

    expect(plan.subject).toMatchObject({
      displayName: "Zorblatt Q. Unmade",
      handle: "zorblatt-q-unmade"
    });
  });

  it("extracts the subject from generated agent instructions before the task wording", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Research and generate a profile for Zorblatt Q. Unmade using public web results only.",
        intent: "manual_profile",
        confidence: 0.4,
        subject: { displayName: "And Generate A", handle: "and-generate-a" },
        sources: [],
        userProvidedClaims: [{ text: "Research and generate a profile for Zorblatt Q. Unmade using public web results only.", type: "summary", confidence: 0.4, evidenceStatus: "user_provided" }],
        missingEvidence: [],
        questions: [],
        warnings: ["No public source was provided."]
      })
    };

    const plan = await planProfileGeneration("Research and generate a profile for Zorblatt Q. Unmade using public web results only.", { client });

    expect(plan.subject).toMatchObject({
      displayName: "Zorblatt Q. Unmade",
      handle: "zorblatt-q-unmade"
    });
  });

  it("does not allow invented URLs unless present in input", async () => {
    const client: JsonLlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        rawInput: "Generate a profile for Ada",
        intent: "generate_profile",
        confidence: 0.8,
        subject: { displayName: "Ada" },
        sources: [{ type: "website", input: "https://invented.example/ada", reason: "Guessed", confidence: 0.8, evidenceStatus: "explicit" }],
        userProvidedClaims: [{ text: "Generate a profile for Ada", type: "summary", confidence: 0.5, evidenceStatus: "user_provided" }],
        missingEvidence: [],
        warnings: [],
        questions: []
      })
    };

    const plan = await planProfileGeneration("Generate a profile for Ada", { client });

    expect(plan.sources).toHaveLength(0);
    expect(plan.userProvidedClaims[0]).toMatchObject({ evidenceStatus: "user_provided" });
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Ignored invented source URL")]));
  });
});
