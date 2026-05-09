export const LLM_FEATURE_STATUS = "optional-evidence-constrained-card-rewrite";

export type RewriteEvidenceRef = {
  id: string;
  type: string;
  title: string;
  reason: string;
  url?: string;
};

export type RewriteClaim = {
  id?: string;
  text: string;
  type: string;
  confidence?: number;
  evidence?: RewriteEvidenceRef[];
};

export type RewriteCard = {
  title: string;
  contentMd: string;
  evidence: RewriteEvidenceRef[];
  claimIds?: string[];
};

export type LlmRewriteInput = {
  draftCard: RewriteCard;
  allowedClaims: RewriteClaim[];
  evidence: RewriteEvidenceRef[];
};

export type LlmRewriteOutput = {
  rewrittenMarkdown: string;
  usedClaimIds: string[];
  usedEvidenceIds: string[];
};

export type LlmRewriteClient = {
  rewrite(input: LlmRewriteInput): Promise<LlmRewriteOutput>;
};

export async function rewriteCardWithEvidence(
  input: LlmRewriteInput,
  client: LlmRewriteClient
): Promise<RewriteCard> {
  try {
    const output = await client.rewrite(input);
    if (!isValidRewrite(input, output)) {
      return input.draftCard;
    }

    return {
      ...input.draftCard,
      contentMd: output.rewrittenMarkdown,
      claimIds: output.usedClaimIds.length > 0 ? output.usedClaimIds : input.draftCard.claimIds,
      evidence: input.evidence.filter((item) => output.usedEvidenceIds.includes(item.id))
    };
  } catch {
    return input.draftCard;
  }
}

export function isLlmRewriteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OPEN_DINQ_ENABLE_LLM_REWRITE === "true" && Boolean(env.OPENAI_API_KEY || env.OPEN_DINQ_LLM_API_KEY);
}

export function createOpenAICompatibleRewriteClient(options: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): LlmRewriteClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const model = options.model ?? "gpt-4.1-mini";

  return {
    async rewrite(input) {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Rewrite the draft card as concise markdown. Do not add facts not present in the provided claims or evidence. Return JSON with rewrittenMarkdown, usedClaimIds, and usedEvidenceIds."
            },
            {
              role: "user",
              content: JSON.stringify(input)
            }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`LLM rewrite failed with ${response.status}`);
      }
      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("LLM rewrite response was empty.");
      }
      return JSON.parse(content) as LlmRewriteOutput;
    }
  };
}

function isValidRewrite(input: LlmRewriteInput, output: LlmRewriteOutput): boolean {
  if (!output.rewrittenMarkdown.trim() || output.rewrittenMarkdown.length > 4_000) {
    return false;
  }

  const allowedClaimIds = new Set(input.allowedClaims.map((claim) => claim.id).filter((id): id is string => Boolean(id)));
  const allowedEvidenceIds = new Set(input.evidence.map((item) => item.id));
  if (!output.usedClaimIds.every((id) => allowedClaimIds.has(id))) {
    return false;
  }
  if (!output.usedEvidenceIds.every((id) => allowedEvidenceIds.has(id))) {
    return false;
  }

  const allowedText = [
    input.draftCard.title,
    input.draftCard.contentMd,
    ...input.allowedClaims.map((claim) => claim.text),
    ...input.evidence.flatMap((item) => [item.title, item.reason, item.url ?? ""])
  ].join(" ");
  const allowedTokens = new Set(tokenizeMeaningful(allowedText));
  const outputTokens = tokenizeMeaningful(output.rewrittenMarkdown);
  const unsupportedTokens = outputTokens.filter((token) => !allowedTokens.has(token));

  return unsupportedTokens.length <= Math.max(4, Math.floor(outputTokens.length * 0.15));
}

function tokenizeMeaningful(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((token) => token.length > 3 && !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  "about",
  "also",
  "and",
  "backed",
  "card",
  "from",
  "into",
  "that",
  "the",
  "this",
  "with"
]);
