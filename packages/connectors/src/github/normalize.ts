import type { GitHubRepo, GitHubUser } from "./types.js";

export function normalizeGitHubUserToPerson(user: GitHubUser) {
  return {
    handle: user.login,
    displayName: user.name ?? user.login,
    headline: buildHeadline(user),
    bio: user.bio ?? undefined,
    location: user.location ?? undefined,
    avatarUrl: user.avatar_url ?? undefined
  };
}

export function normalizeGitHubUserToIdentitySource(user: GitHubUser) {
  return {
    type: "github",
    url: user.html_url,
    externalId: String(user.id),
    rawJson: user
  };
}

export function normalizeGitHubReposToArtifacts(repos: GitHubRepo[]) {
  return repos
    .filter((repo) => !repo.disabled)
    .map((repo) => ({
      type: "repo",
      title: repo.full_name,
      description: repo.description ?? undefined,
      url: repo.html_url,
      metadata: {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics ?? [],
        pushedAt: repo.pushed_at,
        updatedAt: repo.updated_at,
        createdAt: repo.created_at,
        isFork: repo.fork,
        archived: repo.archived ?? false
      },
      evidenceRaw: repo
    }));
}

function buildHeadline(user: GitHubUser): string | undefined {
  if (user.bio) {
    return user.bio;
  }

  if (user.public_repos > 0) {
    return `GitHub developer with ${user.public_repos} public repositories`;
  }

  return undefined;
}

