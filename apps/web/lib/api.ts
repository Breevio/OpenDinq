export const API_BASE_URL =
  process.env.NEXT_PUBLIC_OPENDINQ_API_URL ?? "http://localhost:3011";

export type EvidenceRef = {
  id: string;
  type: string;
  title: string;
  url?: string;
  reason: string;
};

export type ProfileCard = {
  id?: string;
  personId?: string;
  type: string;
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidence: EvidenceRef[];
  confidence?: number;
  visibility?: "public" | "private" | "hidden";
  order?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ProfileArtifact = {
  id?: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export type PersonProfile = {
  person: {
    handle: string;
    displayName: string;
    headline?: string;
    bio?: string;
    location?: string;
    avatarUrl?: string;
    publicStatus?: "draft" | "published";
    publishedAt?: string;
    shareSlug?: string;
  };
  sources: Array<{
    type: string;
    url: string;
    externalId?: string;
  }>;
  artifacts: ProfileArtifact[];
  cards: ProfileCard[];
  claims?: Array<{
    id?: string;
    type: string;
    text: string;
    confidence: number;
    evidence: EvidenceRef[];
    status?: "pending" | "approved" | "rejected";
  }>;
};

export type ProfileWorkspace = {
  profile: PersonProfile;
  publicProfile: PersonProfile;
  profileSources: Array<{
    id?: string;
    type: string;
    status: string;
    url?: string;
    warnings?: string[];
  }>;
  readiness: {
    score: number;
    checks: Array<{ label: string; complete: boolean }>;
  };
  discoverQuery: string;
};

export type SearchResult = {
  person: PersonProfile["person"];
  score: number;
  scoreBreakdown: {
    claimScore: number;
    cardScore: number;
    artifactScore: number;
    skillScore: number;
    evidenceScore: number;
    publishBoost: number;
    recencyScore: number;
    finalScore: number;
  };
  explanation: string;
  evidence: EvidenceRef[];
  matchedClaims?: PersonProfile["claims"];
  matchedCards?: ProfileCard[];
  matchedArtifacts?: ProfileArtifact[];
  topSkills?: string[];
  profileUrl?: string;
};

export type GitHubImportResponse = {
  handle: string;
  cardCount: number;
  artifactCount: number;
  status: "completed" | "needs_review";
  warnings: string[];
  recoveryAdvice?: {
    kind: "github_token_setup";
    title: string;
    message: string;
    actionLabel: string;
    actionCommand: string;
  };
  workspaceUrl: string;
  profileUrl: string;
};

export type RecoveryAdvice = {
  kind: "github_token_setup";
  title: string;
  message: string;
  actionLabel: string;
  actionCommand: string;
};

export type ProfileGenerationResponse = {
  runId: string;
  handle: string;
  status: string;
  profileUrl: string;
  workspaceUrl?: string;
  cardsGenerated: number;
  artifactsImported: number;
  claimsGenerated: number;
  llmUsed?: boolean;
  agentUsed?: boolean;
  plan?: ProfileGenerationPlan;
  warnings: string[];
  recoveryAdvice?: RecoveryAdvice;
};

export type ProfileCandidate = {
  id: string;
  displayName: string;
  headline?: string;
  handle?: string;
  sourceType: "existing_profile" | "openalex" | "orcid" | "arxiv" | "github" | "website" | "manual" | "web";
  kind?: "biography";
  sourceId?: string;
  sourceUrl?: string;
  confidence: number;
  evidencePreview: EvidenceRef[];
  reasons: string[];
  warnings: string[];
  sources?: Array<{
    sourceType: ProfileCandidate["sourceType"];
    sourceId?: string;
    sourceUrl?: string;
    confidence: number;
    evidencePreview: EvidenceRef[];
    reasons: string[];
    warnings: string[];
  }>;
};

export type ProfileResolutionResponse = {
  rawInput: string;
  queryType: "person_name" | "source_url" | "natural_language" | "role_search" | "unknown";
  candidates: ProfileCandidate[];
  autoSelectedCandidateId?: string;
  needsSelection: boolean;
  warnings: string[];
  status?: string;
};

export type SearchAndGenerateResponse = ProfileGenerationResponse & {
  profile?: PersonProfile;
  cards?: ProfileCard[];
  searchResults?: SearchResult[];
  toolCalls?: Array<{ tool: string; input: Record<string, unknown> }>;
  researchSteps?: Array<{
    tool: string;
    title: string;
    status: "completed" | "warning";
    summary: string;
    evidence: EvidenceRef[];
    warnings: string[];
  }>;
  agentWarnings?: string[];
  resolution?: ProfileResolutionResponse;
  candidates?: ProfileCandidate[];
  needsSelection?: boolean;
  rawInput?: string;
  autoSelectedCandidateId?: string;
  queryType?: ProfileResolutionResponse["queryType"];
};

export type ProfileGenerationPlan = {
  rawInput: string;
  intent: string;
  confidence: number;
  subject: {
    displayName?: string;
    handle?: string;
    headline?: string;
    aliases?: string[];
  };
  sources: Array<{
    type: string;
    input: string | Record<string, unknown>;
    confidence: number;
    reason: string;
    evidenceStatus: "explicit" | "inferred" | "user_provided";
  }>;
  userProvidedClaims: Array<{
    text: string;
    type: string;
    confidence: number;
    evidenceStatus: "user_provided";
  }>;
  missingEvidence: Array<{ need: string; reason: string; suggestedSource?: string }>;
  questions: string[];
  warnings: string[];
};

export type ProfilePlanResponse = {
  plan: ProfileGenerationPlan;
  llmUsed: boolean;
  warnings: string[];
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(readableApiError(json?.error?.message));
  }

  return json as T;
}

function readableApiError(message: unknown) {
  if (typeof message !== "string") {
    return "OpenDinq API request failed.";
  }

  try {
    const parsed = JSON.parse(message) as Array<{ code?: string; path?: string[]; message?: string }>;
    const firstIssue = Array.isArray(parsed) ? parsed[0] : undefined;
    if (firstIssue?.path?.includes("input")) {
      return "Enter a search input, public source, or profile URL.";
    }
    if (firstIssue?.message) {
      return firstIssue.message;
    }
  } catch {
    // Non-JSON API errors are already product copy from the API.
  }

  return message;
}

export type AgentResearchStep = {
  tool: string;
  title: string;
  status: "completed" | "warning";
  summary: string;
  evidence: EvidenceRef[];
  warnings: string[];
};

export type AgentStreamEvent =
  | { event: "step"; data: AgentResearchStep }
  | { event: "tool_call"; data: { tool: string; input: Record<string, unknown> } }
  | { event: "tool_result"; data: { tool: string; result: unknown } }
  | { event: "complete"; data: SearchAndGenerateResponse }
  | { event: "error"; data: { message: string } };

/**
 * Subscribe to the SSE agent-search stream. Returns an unsubscribe function.
 * Events are delivered to `onEvent` as they arrive.
 */
export function streamAgentSearch(
  input: string,
  onEvent: (event: AgentStreamEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const controller = new AbortController();
  const decoder = new TextDecoder();

  void fetch(`${API_BASE_URL}/api/profiles/agent-search-stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
    signal: controller.signal
  })
    .then(async (response) => {
      if (!response.ok) {
        const json = await response.json();
        throw new Error(readableApiError(json?.error?.message));
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Stream was not readable.");
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              data += line.slice(5).trim();
            }
          }
          if (!data) {
            continue;
          }
          try {
            const parsed = JSON.parse(data) as unknown;
            onEvent({ event, data: parsed } as AgentStreamEvent);
          } catch {
            // Skip malformed events.
          }
        }
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      if (onError) {
        onError(error instanceof Error ? error : new Error("Stream failed."));
      } else {
        onEvent({ event: "error", data: { message: error instanceof Error ? error.message : "Stream failed." } });
      }
    });

  return () => controller.abort();
}
