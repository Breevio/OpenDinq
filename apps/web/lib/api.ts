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
  type: string;
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidence: EvidenceRef[];
  confidence?: number;
  visibility?: string;
  order?: number;
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
  }>;
};

export type SearchResult = {
  person: PersonProfile["person"];
  score: number;
  explanation: string;
  evidence: EvidenceRef[];
  matchedClaims?: PersonProfile["claims"];
  matchedCards?: ProfileCard[];
};

export type ProfileGenerationResponse = {
  runId: string;
  handle: string;
  status: string;
  profileUrl: string;
  cardsGenerated: number;
  artifactsImported: number;
  claimsGenerated: number;
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
