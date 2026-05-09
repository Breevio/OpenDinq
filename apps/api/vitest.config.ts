import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
