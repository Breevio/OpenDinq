import type { JsonLlmClient } from "./profile-intent-planner.js";

export type LlmRuntimeConfig = {
  provider: "openai-compatible";
  model: string;
  apiKey: string;
  baseUrl?: string;
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
    baseUrl: env.OPEN_DINQ_LLM_BASE_URL
  };
}

export function isLlmGenerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(getLlmGenerationConfig(env));
}

export function createOpenAICompatibleJsonClient(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): JsonLlmClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";

  return {
    async completeJson(input) {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user }
          ]
        })
      });
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
