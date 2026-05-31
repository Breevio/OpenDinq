export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  html_url: string;
  public_repos: number;
  followers: number;
  following: number;
  company?: string | null;
  blog?: string | null;
  twitter_username?: string | null;
};

export type GitHubUserSearchResult = {
  total_count?: number;
  incomplete_results?: boolean;
  items?: Array<{
    login: string;
    id: number;
    html_url: string;
    avatar_url?: string;
    type?: string;
    score?: number;
  }>;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  pushed_at: string | null;
  updated_at: string;
  created_at: string;
  archived?: boolean;
  disabled?: boolean;
};

export type GitHubFetchOptions = {
  fetchImpl?: typeof fetch;
  token?: string;
};

export class GitHubConnectorError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "rate_limited" | "request_failed"
  ) {
    super(message);
    this.name = "GitHubConnectorError";
  }
}
