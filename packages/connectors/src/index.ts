export const CONNECTOR_SOURCES = ["github", "website", "openalex", "arxiv", "orcid"] as const;

export * from "./arxiv/index.js";
export * from "./github/index.js";
export * from "./openalex/index.js";
export * from "./orcid/index.js";
export * from "./website/index.js";
