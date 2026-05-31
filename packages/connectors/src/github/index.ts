export { fetchGitHubRepos, fetchGitHubUser, searchGitHubUsers } from "./client.js";
export { normalizeGitHubReposToArtifacts, normalizeGitHubUserToIdentitySource, normalizeGitHubUserToPerson } from "./normalize.js";
export { parseGitHubProfileUrl } from "./parse.js";
export { GitHubConnectorError } from "./types.js";
export type { GitHubFetchOptions, GitHubRepo, GitHubUser, GitHubUserSearchResult } from "./types.js";
