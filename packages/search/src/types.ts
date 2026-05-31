export type SearchPerson = {
  handle: string;
  displayName: string;
  headline?: string;
  bio?: string;
  location?: string;
  publicStatus?: "draft" | "published";
  publishedAt?: string;
};

export type SearchArtifact = {
  id?: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export type SearchCard = {
  id?: string;
  type: string;
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidence?: SearchEvidenceRef[];
  visibility?: "public" | "private" | "hidden";
};

export type SearchClaim = {
  id?: string;
  type: string;
  text: string;
  confidence?: number;
  qualityScore?: number;
  status?: "pending" | "approved" | "rejected";
  evidence?: SearchEvidenceRef[];
};

export type PersonSearchDocument = {
  person: SearchPerson;
  artifacts: SearchArtifact[];
  cards?: SearchCard[];
  claims?: SearchClaim[];
};

export type ParsedSearchQuery = {
  queryText: string;
  terms: string[];
  phrases: string[];
  intent: {
    skills: string[];
    projectTerms: string[];
    researchTerms: string[];
    sourceHints: string[];
    roleTerms: string[];
  };
};

export type SearchEvidenceRef = {
  id: string;
  type: "artifact" | "card" | "person" | "claim" | "source" | "external";
  title: string;
  url?: string;
  reason: string;
};

export type MatchedSignals = {
  personMatches: string[];
  skillMatches: string[];
  artifactTextMatches: string[];
  impactSignal: number;
  recencySignal: number;
  profileCompleteness: number;
  evidence: SearchEvidenceRef[];
};

export type RankedSearchResult = {
  person: SearchPerson;
  score: number;
  scoreBreakdown: SearchScoreBreakdown;
  explanation: string;
  evidence: SearchEvidenceRef[];
  matchedClaims?: SearchClaim[];
  matchedCards?: SearchCard[];
  matchedArtifacts?: SearchArtifact[];
  topSkills?: string[];
  profileUrl?: string;
};

export type SearchScoreBreakdown = {
  claimScore: number;
  cardScore: number;
  artifactScore: number;
  skillScore: number;
  evidenceScore: number;
  publishBoost: number;
  recencyScore: number;
  finalScore: number;
};

export type SearchProviderMatch = {
  handle: string;
  score: number;
  explanation?: string;
  evidence: SearchEvidenceRef[];
};

export type SearchProvider = {
  name: string;
  search(query: ParsedSearchQuery, documents: PersonSearchDocument[]): Promise<SearchProviderMatch[]> | SearchProviderMatch[];
};

export type HybridSearchOptions = {
  providers?: SearchProvider[];
  weights?: {
    rule: number;
    fullText: number;
    provider: number;
  };
};
