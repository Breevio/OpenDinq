export type CardPerson = {
  handle: string;
  displayName: string;
  headline?: string;
  bio?: string;
};

export type CardArtifact = {
  id?: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export type EvidenceRef = {
  id: string;
  type: "artifact" | "claim" | "source" | "external";
  title: string;
  url?: string;
  reason: string;
};

export type CardClaim = {
  id?: string;
  type: string;
  text: string;
  confidence: number;
  evidence: EvidenceRef[];
  artifactId?: string;
  sourceId?: string;
};

export type GeneratedCard = {
  type: "summary" | "skills" | "works" | "research" | "timeline" | "note" | "github";
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidence: EvidenceRef[];
  sourceIds?: string[];
  claimIds?: string[];
  confidence?: number;
  visibility?: "public" | "private";
  order?: number;
};
