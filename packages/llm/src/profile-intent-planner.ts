import { z } from "zod";

const claimTypeSchema = z.enum(["skill", "role", "project", "research_area", "achievement", "affiliation", "link", "summary"]);
const sourceTypeSchema = z.enum(["github", "website", "openalex", "arxiv", "orcid", "manual"]);
const evidenceStatusSchema = z.enum(["explicit", "inferred", "user_provided"]);

export const profileGenerationPlanSchema = z.object({
  rawInput: z.string().min(1),
  intent: z.enum(["generate_profile", "enrich_existing_profile", "manual_profile", "unknown"]),
  confidence: z.number().min(0).max(1),
  subject: z.object({
    displayName: z.string().min(1).optional(),
    handle: z.string().min(1).optional(),
    headline: z.string().min(1).optional(),
    aliases: z.array(z.string().min(1)).optional()
  }),
  sources: z.array(z.object({
    type: sourceTypeSchema,
    input: z.union([z.string().min(1), z.record(z.unknown())]),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    evidenceStatus: evidenceStatusSchema
  })),
  userProvidedClaims: z.array(z.object({
    text: z.string().min(1),
    type: claimTypeSchema,
    confidence: z.number().min(0).max(1),
    evidenceStatus: z.literal("user_provided")
  })),
  missingEvidence: z.array(z.object({
    need: z.string().min(1),
    reason: z.string().min(1),
    suggestedSource: z.string().min(1).optional()
  })),
  questions: z.array(z.string()),
  warnings: z.array(z.string())
});

export type ProfileGenerationPlan = z.infer<typeof profileGenerationPlanSchema>;
export type ProfileIntentSource = ProfileGenerationPlan["sources"][number];

export type JsonLlmClient = {
  completeJson(input: { system: string; user: string }): Promise<unknown>;
};

export type PlanProfileGenerationOptions = {
  client?: JsonLlmClient;
  llmUnavailableWarning?: string;
};

export async function planProfileGeneration(input: string, options: PlanProfileGenerationOptions = {}): Promise<ProfileGenerationPlan> {
  const fallback = deterministicFallbackPlan(input);
  if (!options.client) {
    return withWarning(fallback, options.llmUnavailableWarning ?? "LLM generation is not configured; using local fallback planning.");
  }

  let json: unknown;
  try {
    json = await options.client.completeJson({
      system: PROFILE_INTENT_SYSTEM_PROMPT,
      user: JSON.stringify({ input })
    });
  } catch {
    return withWarning(fallback, "LLM planning was unavailable; using local fallback planning.");
  }

  try {
    return sanitizePlan(parseProfileGenerationPlan(json, input), input);
  } catch {
    return withWarning(fallback, "Could not parse LLM plan; using local fallback planning.");
  }
}

export function deterministicFallbackPlan(input: string): ProfileGenerationPlan {
  const rawInput = input.trim();
  if (!rawInput) {
    return {
      rawInput,
      intent: "unknown",
      confidence: 0,
      subject: {},
      sources: [],
      userProvidedClaims: [],
      missingEvidence: [{ need: "Profile subject", reason: "OpenDinq needs a person, source, or description to create a workspace." }],
      questions: ["Who should OpenDinq generate a profile for?"],
      warnings: ["Input is required."]
    };
  }

  const explicitSource = explicitSourceFromInput(rawInput);
  if (explicitSource) {
    return {
      rawInput,
      intent: "generate_profile",
      confidence: explicitSource.confidence,
      subject: explicitSource.subject,
      sources: [explicitSource.source],
      userProvidedClaims: [],
      missingEvidence: [],
      questions: [],
      warnings: []
    };
  }

  const displayName = extractPersonName(rawInput) ?? inferBarePersonName(rawInput);
  return {
    rawInput,
    intent: "manual_profile",
    confidence: 0.62,
    subject: {
      displayName,
      handle: displayName ? slugify(displayName) : undefined,
      headline: inferHeadline(rawInput)
    },
    sources: [{
      type: "manual",
      input: { title: displayName ? `${displayName} profile request` : "User-provided profile request", note: rawInput },
      confidence: 0.55,
      reason: "The user provided descriptive input, not a verified public source.",
      evidenceStatus: "user_provided"
    }],
    userProvidedClaims: [{
      text: rawInput,
      type: inferClaimType(rawInput),
      confidence: 0.55,
      evidenceStatus: "user_provided"
    }],
    missingEvidence: [{
      need: "Public evidence source",
      reason: "Natural-language input is useful context, but it is not verified public evidence.",
      suggestedSource: "Add a GitHub profile, website, paper, ORCID, arXiv id, or OpenAlex id."
    }],
    questions: [],
    warnings: ["This profile was generated from user-provided information. Add public sources to strengthen evidence."]
  };
}

export const PROFILE_INTENT_SYSTEM_PROMPT = [
  "Return JSON only for an OpenDinq ProfileGenerationPlan.",
  "Use exactly these keys: rawInput, intent, confidence, subject, sources, userProvidedClaims, missingEvidence, questions, warnings.",
  "Allowed intent values: generate_profile, enrich_existing_profile, manual_profile, unknown.",
  "A source object is: {type,input,confidence,reason,evidenceStatus}.",
  "Allowed source types: github, website, openalex, arxiv, orcid, manual.",
  "Allowed evidenceStatus: explicit, inferred, user_provided.",
  "Do not browse and do not invent URLs, ids, repos, papers, companies, roles, or skills.",
  "Only user-provided URLs/ids/handles can be explicit sources.",
  "Natural language without public source becomes manual_profile, userProvidedClaims, and missingEvidence.",
  "Prefer a reviewable plan over blocking."
].join("\n");

function parseProfileGenerationPlan(json: unknown, rawInput: string): ProfileGenerationPlan {
  const parsed = profileGenerationPlanSchema.safeParse(json);
  if (parsed.success) {
    return parsed.data;
  }
  return profileGenerationPlanSchema.parse(coerceProfileGenerationPlan(json, rawInput));
}

function coerceProfileGenerationPlan(json: unknown, rawInput: string): unknown {
  const fallback = deterministicFallbackPlan(rawInput);
  if (!json || typeof json !== "object") {
    return fallback;
  }

  const record = json as Record<string, unknown>;
  const subjectText = stringValue(record.subject);
  const person = objectValue(record.subject) ?? objectValue(record.inferredPerson) ?? objectValue(record.person) ?? {};
  const firstName = arrayValue(person.names).find((name): name is Record<string, unknown> => Boolean(name) && typeof name === "object");
  const displayName = stringValue(person.displayName) ?? stringValue(firstName?.fullName) ?? subjectText ?? fallback.subject.displayName;
  const domainHeadline = stringArray(person.domains).slice(0, 2).join(", ");
  const subject = {
    displayName,
    handle: stringValue(person.handle) ?? (displayName ? slugify(displayName) : fallback.subject.handle),
    headline: stringValue(person.headline) ?? stringValue(person.title) ?? (domainHeadline || undefined) ?? fallback.subject.headline,
    aliases: stringArray(person.aliases)
  };
  const sources = coerceSources(record.sources, rawInput);
  const userProvidedClaims = coerceUserProvidedClaims(record.userProvidedClaims, rawInput, sources.length > 0 ? [] : fallback.userProvidedClaims);
  const missingEvidence = coerceMissingEvidence(record.missingEvidence, sources, userProvidedClaims, fallback.missingEvidence);
  const warnings = stringArray(record.warnings);
  if (sources.length === 0 && fallback.sources.some((source) => source.evidenceStatus === "explicit")) {
    warnings.unshift("Could not parse LLM plan; using local fallback planning.");
  }

  return {
    rawInput,
    intent: sources.some((source) => source.evidenceStatus === "explicit") ? "generate_profile" : "manual_profile",
    confidence: numberValue(record.confidence) ?? fallback.confidence,
    subject,
    sources: sources.length > 0 ? sources : fallback.sources,
    userProvidedClaims,
    missingEvidence,
    questions: stringArray(record.questions),
    warnings
  };
}

function sanitizePlan(plan: ProfileGenerationPlan, rawInput: string): ProfileGenerationPlan {
  const warnings = [...plan.warnings];
  const sources = plan.sources.filter((source) => {
    if (source.type === "manual") {
      return true;
    }
    if (source.evidenceStatus !== "explicit") {
      warnings.push(`Ignored inferred ${source.type} source because it was not explicitly provided by the user.`);
      return false;
    }
    if (typeof source.input !== "string") {
      warnings.push(`Ignored ${source.type} source because input was not a string.`);
      return false;
    }
    if ((source.type === "website" || source.type === "github") && isUrl(source.input) && !rawInput.includes(source.input)) {
      warnings.push(`Ignored invented source URL: ${source.input}`);
      return false;
    }
    return true;
  });

  const missingEvidence = [...plan.missingEvidence];
  if (sources.length === 0 && plan.userProvidedClaims.length > 0 && missingEvidence.length === 0) {
    missingEvidence.push({
      need: "Public evidence source",
      reason: "The current plan only has user-provided information.",
      suggestedSource: "Add a GitHub, website, ORCID, arXiv, or OpenAlex source."
    });
  }

  return {
    ...plan,
    rawInput,
    intent: sources.some((source) => source.evidenceStatus === "explicit") ? plan.intent : "manual_profile",
    sources: sources.length > 0 ? sources : plan.sources.filter((source) => source.type === "manual"),
    missingEvidence,
    warnings
  };
}

function explicitSourceFromInput(input: string): { source: ProfileIntentSource; confidence: number; subject: ProfileGenerationPlan["subject"] } | undefined {
  if (isOrcid(input)) {
    return { source: source("orcid", input, "ORCID id was explicitly provided by the user.", 0.9), confidence: 0.9, subject: {} };
  }
  if (isArxivId(input)) {
    return { source: source("arxiv", input, "arXiv id was explicitly provided by the user.", 0.88), confidence: 0.88, subject: {} };
  }
  if (isOpenAlexId(input)) {
    return { source: source("openalex", input, "OpenAlex id was explicitly provided by the user.", 0.88), confidence: 0.88, subject: {} };
  }
  const github = githubInput(input);
  if (github) {
    return { source: source("github", github, "GitHub handle or profile URL was explicitly provided by the user.", 0.9), confidence: 0.9, subject: { handle: github } };
  }
  if (isUrl(input)) {
    return { source: source("website", input, "Website URL was explicitly provided by the user.", 0.86), confidence: 0.86, subject: {} };
  }
  return undefined;
}

function source(type: ProfileIntentSource["type"], input: string, reason: string, confidence: number): ProfileIntentSource {
  return { type, input, confidence, reason, evidenceStatus: "explicit" };
}

function coerceSources(value: unknown, rawInput: string): ProfileGenerationPlan["sources"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const explicit = stringValue(item);
    if (explicit) {
      const parsed = explicitSourceFromInput(explicit);
      return parsed ? [parsed.source] : [];
    }

    const record = objectValue(item);
    if (!record) return [];
    const type = stringValue(record.type);
    const rawSourceInput = stringValue(record.input) ?? stringValue(record.value) ?? stringValue(record.url) ?? stringValue(record.id);
    if (!type || !rawSourceInput || !sourceTypeSchema.safeParse(type).success) return [];
    const evidenceStatus = evidenceStatusSchema.safeParse(record.evidenceStatus).success ? record.evidenceStatus as ProfileIntentSource["evidenceStatus"] : (sourceWasExplicit(type, rawSourceInput, rawInput) ? "explicit" : "inferred");
    const input = type === "github" ? githubInput(rawSourceInput) ?? githubInput(rawInput) ?? rawSourceInput : rawSourceInput;
    return [{
      type: type as ProfileIntentSource["type"],
      input,
      confidence: numberValue(record.confidence) ?? 0.7,
      reason: stringValue(record.reason) ?? "LLM included this source in the generation plan.",
      evidenceStatus
    }];
  });
}

function coerceUserProvidedClaims(value: unknown, rawInput: string, fallback: ProfileGenerationPlan["userProvidedClaims"]): ProfileGenerationPlan["userProvidedClaims"] {
  if (!Array.isArray(value)) return fallback;
  const claims = value.flatMap((item) => {
    const record = objectValue(item);
    const text = stringValue(record?.text);
    const type = record?.type;
    if (!text || !claimTypeSchema.safeParse(type).success) return [];
    return [{ text, type: type as ProfileGenerationPlan["userProvidedClaims"][number]["type"], confidence: numberValue(record?.confidence) ?? 0.55, evidenceStatus: "user_provided" as const }];
  });
  return claims.length > 0 ? claims : fallback;
}

function coerceMissingEvidence(value: unknown, sources: ProfileGenerationPlan["sources"], claims: ProfileGenerationPlan["userProvidedClaims"], fallback: ProfileGenerationPlan["missingEvidence"]): ProfileGenerationPlan["missingEvidence"] {
  if (Array.isArray(value)) {
    const missing = value.flatMap((item) => {
      const text = stringValue(item);
      if (text) {
        return [{ need: text, reason: "The LLM marked this information as missing evidence." }];
      }
      const record = objectValue(item);
      const need = stringValue(record?.need) ?? stringValue(record?.claim);
      const reason = stringValue(record?.reason) ?? stringValue(record?.suggestion);
      if (!need || !reason) return [];
      return [{ need, reason, suggestedSource: stringValue(record?.suggestedSource) ?? stringValue(record?.source) }];
    });
    if (missing.length > 0) return missing;
  }
  return sources.some((source) => source.evidenceStatus === "explicit") ? [] : fallback.length > 0 ? fallback : claims.length > 0 ? [{ need: "Public evidence source", reason: "User-provided claims need public evidence before they should be treated as verified.", suggestedSource: "Add a GitHub, website, ORCID, arXiv, or OpenAlex source." }] : [];
}

function withWarning(plan: ProfileGenerationPlan, warning: string): ProfileGenerationPlan {
  return { ...plan, warnings: [...new Set([warning, ...plan.warnings])] };
}

function sourceWasExplicit(type: string, input: string, rawInput: string): boolean {
  if (rawInput.includes(input)) return true;
  if (type === "github" && githubInput(rawInput) === input) return true;
  return false;
}

function githubInput(input: string): string | undefined {
  const githubUrl = input.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i);
  if (githubUrl?.[1]) return githubUrl[1];
  return /^[A-Za-z0-9-]{2,39}$/.test(input) && !isOpenAlexId(input) ? input : undefined;
}

function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch { return false; }
}

function isOrcid(input: string): boolean { return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(input); }
function isArxivId(input: string): boolean { return /^(\d{4}\.\d{4,5})(v\d+)?$/i.test(input) || /^[a-z-]+\/\d{7}(v\d+)?$/i.test(input); }
function isOpenAlexId(input: string): boolean { return /^https?:\/\/openalex\.org\/[A-Z]\d+$/i.test(input) || /^[A-Z]\d{4,}$/i.test(input); }

function extractPersonName(input: string): string | undefined {
  const match = input.match(/(?:profile for|for)\s+([A-Z][A-Za-z0-9 .'-]{2,80})/i);
  return titleName(match?.[1]);
}

function inferBarePersonName(input: string): string | undefined {
  const trimmed = input.trim();
  if (!/^[A-Za-z][A-Za-z .'-]{2,80}$/.test(trimmed)) return undefined;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return undefined;
  const lowered = trimmed.toLowerCase();
  if (["engineer", "designer", "researcher", "builder", "maintainer", "developer"].some((word) => lowered.includes(word))) return undefined;
  return titleName(trimmed);
}

function titleName(value: string | undefined): string | undefined {
  return value?.trim().split(/\s+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function inferHeadline(input: string): string | undefined {
  const lowered = input.toLowerCase();
  if (lowered.includes("product engineer")) return "AI product engineer";
  if (lowered.includes("researcher")) return "Researcher";
  if (lowered.includes("designer")) return "Product designer";
  return undefined;
}

function inferClaimType(input: string): ProfileGenerationPlan["userProvidedClaims"][number]["type"] {
  const lowered = input.toLowerCase();
  if (lowered.includes("research") || lowered.includes("paper")) return "research_area";
  if (lowered.includes("engineer") || lowered.includes("designer") || lowered.includes("researcher")) return "role";
  if (lowered.includes("built") || lowered.includes("project")) return "project";
  return "summary";
}

function slugify(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); }
function objectValue(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" ? value as Record<string, unknown> : undefined; }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : []; }
