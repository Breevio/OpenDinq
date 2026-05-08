export { fetchGitHubRepos, fetchGitHubUser } from "./client.js";
export { normalizeGitHubReposToArtifacts, normalizeGitHubUserToIdentitySource, normalizeGitHubUserToPerson } from "./normalize.js";
export { parseGitHubProfileUrl } from "./parse.js";
export { GitHubConnectorError } from "./types.js";
export type { GitHubFetchOptions, GitHubRepo, GitHubUser } from "./types.js";

