export const API_BASE_URL =
  process.env.NEXT_PUBLIC_OPENDINQ_API_URL ?? "http://localhost:3001";

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
  plan?: ProfileGenerationPlan;
  warnings: string[];
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
    throw new Error(json?.error?.message ?? "OpenDinq API request failed.");
  }

  return json as T;
}
