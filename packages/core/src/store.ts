export type IdentitySourceRecord = {
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
  type: "artifact" | "external";
  title: string;
  url?: string;
  reason: string;
};

export type CardRecord = {
  type: string;
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidence: EvidenceRecord[];
};

export type PersonProfileRecord = {
  person: PersonRecord;
  sources: IdentitySourceRecord[];
  artifacts: ArtifactRecord[];
  cards: CardRecord[];
};

export type OpenDinqStore = {
  upsertProfile(record: PersonProfileRecord): Promise<PersonProfileRecord>;
  getProfile(handle: string): Promise<PersonProfileRecord | undefined>;
  listProfiles(): Promise<PersonProfileRecord[]>;
  listCards(handle: string): Promise<CardRecord[] | undefined>;
  saveCard(handle: string, card: CardRecord): Promise<CardRecord | undefined>;
};
