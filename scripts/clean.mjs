import { rm } from "node:fs/promises";

const generatedPaths = [
  "dist",
  "apps/api/dist",
  "apps/mcp/dist",
  "apps/web/.next",
  "apps/web/.next-dev",
  "packages/cards/dist",
  "packages/connectors/dist",
  "packages/core/dist",
  "packages/db/dist",
  "packages/llm/dist",
  "packages/search/dist",
  "packages/shared/dist"
];

for (const generatedPath of generatedPaths) {
  await rm(generatedPath, { recursive: true, force: true });
}
