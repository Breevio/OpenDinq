import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep tests hermetic: tests that assert the "LLM not configured" path must not
    // depend on a developer's local OPEN_DINQ_* shell/.env values. Tests needing an
    // LLM inject a client explicitly via createApp({ llmClient }).
    env: {
      OPEN_DINQ_ENABLE_LLM_GENERATION: "",
      OPEN_DINQ_LLM_MODEL: "",
      OPEN_DINQ_LLM_API_KEY: "",
      OPEN_DINQ_ENABLE_LLM_REWRITE: ""
    }
  },
  resolve: {
    alias: {
      "@opendinq/cards": resolve(__dirname, "../../packages/cards/src/index.ts"),
      "@opendinq/connectors": resolve(__dirname, "../../packages/connectors/src/index.ts"),
      "@opendinq/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@opendinq/db": resolve(__dirname, "../../packages/db/src/index.ts"),
      "@opendinq/llm": resolve(__dirname, "../../packages/llm/src/index.ts"),
      "@opendinq/search": resolve(__dirname, "../../packages/search/src/index.ts"),
      "@opendinq/shared": resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  }
});
