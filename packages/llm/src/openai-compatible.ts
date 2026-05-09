import type { JsonLlmClient } from "./profile-intent-planner.js";

export type LlmRuntimeConfig = {
  provider: "openai-compatible";
  model: string;
  apiKey: string;
  baseUrl?: string;
  chatCompletionsUrl?: string;
  timeoutMs?: number;
  maxTokens?: number;
};

export function getLlmGenerationConfig(env: Record<string, string | undefined> = process.env): LlmRuntimeConfig | undefined {
  if (env.OPEN_DINQ_ENABLE_LLM_GENERATION !== "true") {
    return undefined;
  }
  if (env.OPEN_DINQ_LLM_PROVIDER && env.OPEN_DINQ_LLM_PROVIDER !== "openai-compatible") {
    return undefined;
  }
  const model = env.OPEN_DINQ_LLM_MODEL;
  const apiKey = env.OPEN_DINQ_LLM_API_KEY;
  if (!model || !apiKey) {
    return undefined;
  }
  return {
    provider: "openai-compatible",
    model,
    apiKey,
    baseUrl: env.OPEN_DINQ_LLM_BASE_URL,
    chatCompletionsUrl: env.OPEN_DINQ_LLM_CHAT_COMPLETIONS_URL,
    timeoutMs: parsePositiveInteger(env.OPEN_DINQ_LLM_TIMEOUT_MS),
    maxTokens: parsePositiveInteger(env.OPEN_DINQ_LLM_MAX_TOKENS)
  };
}

export function isLlmGenerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(getLlmGenerationConfig(env));
}

export function createOpenAICompatibleJsonClient(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  chatCompletionsUrl?: string;
  timeoutMs?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): JsonLlmClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const chatCompletionsUrl = normalizeChatCompletionsUrl(options.chatCompletionsUrl ?? options.baseUrl);
  const timeoutMs = options.timeoutMs ?? 35000;
  const maxTokens = options.maxTokens ?? 1200;

  return {
    async completeJson(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetchImpl(chatCompletionsUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0.1,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user }
          ]
        })
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) {
        throw new Error(`LLM JSON call failed with ${response.status}`);
      }
      const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("LLM JSON response was empty.");
      }
      return JSON.parse(content) as unknown;
    }
  };
}

export function normalizeChatCompletionsUrl(baseUrl?: string): string {
  const configured = (baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  return configured.endsWith("/chat/completions") ? configured : `${configured}/chat/completions`;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
