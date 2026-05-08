export type IdentitySourceRecord = {
  id?: string;
  type: string;
  url: string;
  externalId?: string;
  rawJson?: unknown;
};

export type PersonRecord = {
  handle: string;
  displayName: string;
  headline?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
};

export type ArtifactRecord = {
  id?: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  evidenceRaw?: unknown;
};

export type EvidenceRecord = {
  id: string;
  type: "artifact" | "claim" | "source" | "external";
  title: string;
  url?: string;
  reason: string;
};

export type CardRecord = {
  id?: string;
  type: string;
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidence: EvidenceRecord[];
  sourceIds?: string[];
  claimIds?: string[];
  confidence?: number;
  visibility?: "public" | "private";
  order?: number;
};

export type ProfileClaimRecord = {
  id?: string;
  personId?: string;
  sourceId?: string;
  artifactId?: string;
  type: "skill" | "role" | "project" | "research_area" | "achievement" | "affiliation" | "link" | "summary";
  text: string;
  confidence: number;
  evidence: EvidenceRecord[];
};

export type ProfileSourceRecord = {
  id?: string;
  personId?: string;
  runId?: string;
  type: "github" | "website" | "openalex" | "arxiv" | "orcid" | "manual";
  url?: string;
  status: "pending" | "running" | "completed" | "failed" | "needs_review";
  rawJson?: unknown;
  normalizedJson?: unknown;
  warnings?: string[];
};

export type ProfileGenerationRunRecord = {
  id: string;
  targetHandle: string;
  displayName: string;
  status: "pending" | "running" | "completed" | "failed" | "needs_review";
  inputJson: unknown;
  sourceSummaryJson?: unknown;
  warningsJson?: unknown;
  errorJson?: unknown;
  createdAt: string;
  updatedAt: string;
  generatedProfileHandle?: string;
};

export type PersonProfileRecord = {
  person: PersonRecord;
  sources: IdentitySourceRecord[];
  artifacts: ArtifactRecord[];
  cards: CardRecord[];
  claims?: ProfileClaimRecord[];
};

export type OpenDinqStore = {
  upsertProfile(record: PersonProfileRecord): Promise<PersonProfileRecord>;
  getProfile(handle: string): Promise<PersonProfileRecord | undefined>;
  listProfiles(): Promise<PersonProfileRecord[]>;
  listCards(handle: string): Promise<CardRecord[] | undefined>;
  saveCard(handle: string, card: CardRecord): Promise<CardRecord | undefined>;
  createProfileRun(run: ProfileGenerationRunRecord): Promise<ProfileGenerationRunRecord>;
  updateProfileRun(runId: string, patch: Partial<ProfileGenerationRunRecord>): Promise<ProfileGenerationRunRecord | undefined>;
  getProfileRun(runId: string): Promise<ProfileGenerationRunRecord | undefined>;
  saveProfileSources(handle: string, sources: ProfileSourceRecord[]): Promise<ProfileSourceRecord[]>;
  listProfileSources(runId: string): Promise<ProfileSourceRecord[]>;
  saveProfileClaims(handle: string, claims: ProfileClaimRecord[]): Promise<ProfileClaimRecord[]>;
  listProfileClaims(handle: string): Promise<ProfileClaimRecord[]>;
};
