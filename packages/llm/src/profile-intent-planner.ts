import { z } from "zod";

const sourceTypeSchema = z.enum(["github", "website", "openalex", "arxiv", "orcid", "manual"]);

export const profileGenerationPlanSchema = z.object({
  rawInput: z.string().min(1),
  intent: z.enum(["generate_profile", "enrich_existing_profile", "search_then_generate", "manual_profile", "unknown"]),
  confidence: z.number().min(0).max(1),
  inferredPerson: z.object({
    displayName: z.string().min(1).optional(),
    handle: z.string().min(1).optional(),
    headline: z.string().min(1).optional(),
    aliases: z.array(z.string().min(1)).optional()
  }),
  sources: z.array(z.object({
    type: sourceTypeSchema,
    input: z.union([z.string().min(1), z.record(z.unknown())]),
    reason: z.string().min(1),
    confidence: z.number().min(0).max(1)
  })),
  manualNotes: z.array(z.object({
    text: z.string().min(1),
    reason: z.string().min(1)
  })),
  searchQueries: z.array(z.object({
    query: z.string().min(1),
    reason: z.string().min(1)
  })),
  warnings: z.array(z.string()),
  questions: z.array(z.string())
});

export type ProfileGenerationPlan = z.infer<typeof profileGenerationPlanSchema>;
export type ProfileIntentSource = ProfileGenerationPlan["sources"][number];

export type JsonLlmClient = {
  completeJson(input: { system: string; user: string }): Promise<unknown>;
};

export type PlanProfileGenerationOptions = {
  client?: JsonLlmClient;
};

export async function planProfileGeneration(input: string, options: PlanProfileGenerationOptions = {}): Promise<ProfileGenerationPlan> {
  const fallback = deterministicFallbackPlan(input);
  if (!options.client) {
    return fallback;
  }

  try {
    const json = await options.client.completeJson({
      system: PROFILE_INTENT_SYSTEM_PROMPT,
      user: JSON.stringify({ input })
    });
    const parsed = parseProfileGenerationPlan(json, input);
    const sanitized = sanitizePlan(parsed, input);
    return sanitized.sources.length > 0 || sanitized.manualNotes.length > 0 ? sanitized : fallbackWithWarning(fallback, "LLM returned no usable sources or notes; using deterministic fallback.");
  } catch {
    return fallbackWithWarning(fallback, "LLM planning failed or returned invalid JSON; using deterministic fallback.");
  }
}

export function deterministicFallbackPlan(input: string): ProfileGenerationPlan {
  const rawInput = input.trim();
  if (!rawInput) {
    return {
      rawInput,
      intent: "unknown",
      confidence: 0,
      inferredPerson: {},
      sources: [],
      manualNotes: [],
      searchQueries: [],
      warnings: ["Input is required."],
      questions: ["Who should OpenDinq generate a profile for?"]
    };
  }

  if (isOrcid(rawInput)) {
    return planWithSource(rawInput, "orcid", rawInput, "Input looks like an ORCID.", 0.9, {});
  }

  if (isArxivId(rawInput)) {
    return planWithSource(rawInput, "arxiv", rawInput, "Input looks like an arXiv id.", 0.88, {});
  }

  if (isOpenAlexId(rawInput)) {
    return planWithSource(rawInput, "openalex", rawInput, "Input looks like an OpenAlex id.", 0.88, {});
  }

  const github = githubInput(rawInput);
  if (github) {
    return planWithSource(rawInput, "github", github, "Input looks like a GitHub username or profile URL.", 0.9, { handle: github });
  }

  if (isUrl(rawInput)) {
    return planWithSource(rawInput, "website", rawInput, "Input is a public website URL.", 0.86, {});
  }

  const displayName = extractPersonName(rawInput);
  return {
    rawInput,
    intent: "manual_profile",
    confidence: 0.62,
    inferredPerson: {
      displayName,
      handle: displayName ? slugify(displayName) : undefined,
      headline: inferHeadline(rawInput)
    },
    sources: [{
      type: "manual",
      input: {
        title: displayName ? `${displayName} profile request` : "Manual profile request",
        note: rawInput
      },
      reason: "No reliable public source URL or id was provided, so OpenDinq can only create a manual evidence seed.",
      confidence: 0.55
    }],
    manualNotes: [{ text: rawInput, reason: "Original natural-language request." }],
    searchQueries: [{ query: rawInput.replace(/^generate a profile (for|from)\s+/i, ""), reason: "Future source discovery query; no web-wide search is run in this alpha." }],
    warnings: ["No public source URL was provided. Add GitHub, website, ORCID, arXiv, or OpenAlex for stronger evidence."],
    questions: []
  };
}

export const PROFILE_INTENT_SYSTEM_PROMPT = [
  "You plan OpenDinq evidence-backed profile generation.",
  "Output strict JSON only. Do not output markdown, prose, comments, or alternative schemas.",
  "The top-level JSON object must have exactly these keys:",
  "rawInput, intent, confidence, inferredPerson, sources, manualNotes, searchQueries, warnings, questions.",
  "Schema:",
  "{",
  "  \"rawInput\": string,",
  "  \"intent\": \"generate_profile\" | \"enrich_existing_profile\" | \"search_then_generate\" | \"manual_profile\" | \"unknown\",",
  "  \"confidence\": number between 0 and 1,",
  "  \"inferredPerson\": { \"displayName\"?: string, \"handle\"?: string, \"headline\"?: string, \"aliases\"?: string[] },",
  "  \"sources\": [{ \"type\": \"github\" | \"website\" | \"openalex\" | \"arxiv\" | \"orcid\" | \"manual\", \"input\": string | object, \"reason\": string, \"confidence\": number between 0 and 1 }],",
  "  \"manualNotes\": [{ \"text\": string, \"reason\": string }],",
  "  \"searchQueries\": [{ \"query\": string, \"reason\": string }],",
  "  \"warnings\": string[],",
  "  \"questions\": string[]",
  "}",
  "For GitHub profile URLs, use source { \"type\": \"github\", \"input\": \"username\" }, not a nested url field.",
  "For website URLs, use source { \"type\": \"website\", \"input\": \"https://...\" }.",
  "Do not invent URLs.",
  "Do not claim sources exist unless present in the input.",
  "If the user provides a GitHub URL or username, include a GitHub source.",
  "If the user provides a URL, include a website source unless it is clearly GitHub.",
  "If the user provides ORCID, arXiv, or OpenAlex id, include that source.",
  "If the user only gives natural language, create a manual source/note and optionally searchQueries.",
  "Ask questions only when generation cannot proceed.",
  "Prefer low-risk manual profile when enough description exists.",
  "Allowed source types: github, website, openalex, arxiv, orcid, manual."
].join("\n");

function sanitizePlan(plan: ProfileGenerationPlan, rawInput: string): ProfileGenerationPlan {
  const warnings = [...plan.warnings];
  const sources = plan.sources.filter((source) => {
    if (source.type === "manual") {
      return true;
    }
    if (typeof source.input !== "string") {
      warnings.push(`Rejected ${source.type} source because input was not a string.`);
      return false;
    }
    if ((source.type === "website" || source.type === "github") && isUrl(source.input) && !rawInput.includes(source.input)) {
      warnings.push(`Rejected hallucinated source URL: ${source.input}`);
      return false;
    }
    return true;
  });

  return {
    ...plan,
    rawInput,
    sources,
    warnings
  };
}

function parseProfileGenerationPlan(json: unknown, rawInput: string): ProfileGenerationPlan {
  const parsed = profileGenerationPlanSchema.safeParse(json);
  if (parsed.success) {
    return parsed.data;
  }

  const coerced = coerceProfileGenerationPlan(json, rawInput);
  return profileGenerationPlanSchema.parse(coerced);
}

function coerceProfileGenerationPlan(json: unknown, rawInput: string): unknown {
  if (!json || typeof json !== "object") {
    return json;
  }

  const record = json as Record<string, unknown>;
  const fallback = deterministicFallbackPlan(rawInput);
  const person = record.person && typeof record.person === "object" ? record.person as Record<string, unknown> : {};
  const names = Array.isArray(person.names) ? person.names : [];
  const firstName = names.find((name): name is Record<string, unknown> => Boolean(name) && typeof name === "object");
  const displayName = stringValue(record.displayName) ?? stringValue(person.displayName) ?? stringValue(firstName?.fullName);
  const domainHeadline = stringArray(person.domains).slice(0, 2).join(", ");
  const headline = stringValue(record.headline) ?? stringValue(person.headline) ?? (domainHeadline || undefined);
  const sources = coerceSources(record.sources, rawInput);
  const manualNotes = stringArray(record.manualNotes).map((text) => ({ text, reason: "LLM-provided manual note." }));
  const searchQueries = stringArray(record.searchQueries).map((query) => ({ query, reason: "LLM-provided search query." }));
  const warnings = stringArray(record.warnings);
  if (sources.length === 0 && fallback.sources.length > 0) {
    warnings.unshift("LLM planning failed or returned invalid JSON; using deterministic fallback.");
  }

  return {
    rawInput,
    intent: sources.length > 0 ? "generate_profile" : fallback.intent,
    confidence: numberValue(record.confidence) ?? fallback.confidence,
    inferredPerson: {
      displayName,
      handle: stringValue(record.handle) ?? fallback.inferredPerson.handle,
      headline: headline || fallback.inferredPerson.headline,
      aliases: stringArray(person.aliases)
    },
    sources: sources.length > 0 ? sources : fallback.sources,
    manualNotes: manualNotes.length > 0 ? manualNotes : fallback.manualNotes,
    searchQueries: searchQueries.length > 0 ? searchQueries : fallback.searchQueries,
    warnings,
    questions: stringArray(record.questions)
  };
}

function coerceSources(value: unknown, rawInput: string): ProfileGenerationPlan["sources"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const source = item as Record<string, unknown>;
    const type = stringValue(source.type);
    const rawSourceInput = stringValue(source.input) ?? stringValue(source.url) ?? stringValue(source.id);
    if (!type || !rawSourceInput || !sourceTypeSchema.safeParse(type).success) {
      return [];
    }

    const sourceInput = type === "github" ? githubInput(rawSourceInput) ?? githubInput(rawInput) ?? rawSourceInput : rawSourceInput;
    return [{
      type: type as ProfileIntentSource["type"],
      input: sourceInput,
      reason: stringValue(source.reason) ?? "LLM inferred this source from the input.",
      confidence: numberValue(source.confidence) ?? 0.7
    }];
  });
}

function fallbackWithWarning(plan: ProfileGenerationPlan, warning: string): ProfileGenerationPlan {
  return {
    ...plan,
    warnings: [...new Set([warning, ...plan.warnings])]
  };
}

function planWithSource(rawInput: string, type: ProfileIntentSource["type"], sourceInput: string, reason: string, confidence: number, inferredPerson: ProfileGenerationPlan["inferredPerson"]): ProfileGenerationPlan {
  return {
    rawInput,
    intent: "generate_profile",
    confidence,
    inferredPerson,
    sources: [{ type, input: sourceInput, reason, confidence }],
    manualNotes: [],
    searchQueries: [],
    warnings: [],
    questions: []
  };
}

function githubInput(input: string): string | undefined {
  const githubUrl = input.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i);
  if (githubUrl?.[1]) {
    return githubUrl[1];
  }
  return /^[A-Za-z0-9-]{2,39}$/.test(input) && !isOpenAlexId(input) ? input : undefined;
}

function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isOrcid(input: string): boolean {
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(input);
}

function isArxivId(input: string): boolean {
  return /^(\d{4}\.\d{4,5})(v\d+)?$/i.test(input) || /^[a-z-]+\/\d{7}(v\d+)?$/i.test(input);
}

function isOpenAlexId(input: string): boolean {
  return /^https?:\/\/openalex\.org\/[A-Z]\d+$/i.test(input) || /^[A-Z]\d{4,}$/i.test(input);
}

function extractPersonName(input: string): string | undefined {
  const match = input.match(/(?:profile for|for)\s+([A-Z][A-Za-z0-9 .'-]{2,80})/);
  return match?.[1]?.trim();
}

function inferHeadline(input: string): string | undefined {
  const lowered = input.toLowerCase();
  if (lowered.includes("product engineer")) {
    return "AI product engineer";
  }
  if (lowered.includes("researcher")) {
    return "Researcher";
  }
  if (lowered.includes("designer")) {
    return "Product designer";
  }
  return undefined;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}
