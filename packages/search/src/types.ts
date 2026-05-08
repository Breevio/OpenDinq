export type SearchPerson = {
  handle: string;
  displayName: string;
  headline?: string;
  bio?: string;
  location?: string;
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
  type: string;
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
};

export type SearchClaim = {
  id?: string;
  type: string;
  text: string;
  confidence?: number;
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
};

export type SearchEvidenceRef = {
  id: string;
  type: "artifact" | "card" | "person" | "claim" | "source" | "external";
  title: string;
  url?: string;
  reason: string;
};

export type MatchedSignals = {
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
  explanation: string;
  evidence: SearchEvidenceRef[];
  matchedClaims?: SearchClaim[];
  matchedCards?: SearchCard[];
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
