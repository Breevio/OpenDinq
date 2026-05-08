const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

export function parseGitHubProfileUrl(input: string): string {
  const normalizedInput = input.trim();

  if (!normalizedInput) {
    throw new Error("GitHub input is required.");
  }

  const username = normalizedInput.includes("/")
    ? parseUsernameFromUrl(normalizedInput)
    : normalizedInput;

  return normalizeUsername(username);
}

function parseUsernameFromUrl(input: string): string {
  const url = new URL(input.startsWith("http") ? input : `https://${input}`);

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Input must be a GitHub profile URL or username.");
  }

  const [username] = url.pathname.split("/").filter(Boolean);

  if (!username) {
    throw new Error("GitHub profile URL must include a username.");
  }

  return username;
}

function normalizeUsername(username: string): string {
  const normalizedUsername = username.replace(/^@/, "").trim();

  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(normalizedUsername)) {
    throw new Error("GitHub username is invalid.");
  }

  return normalizedUsername;
}

