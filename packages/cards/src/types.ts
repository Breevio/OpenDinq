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
  type: "artifact" | "external";
  title: string;
  url?: string;
  reason: string;
};

export type GeneratedCard = {
  type: "summary" | "github" | "skills" | "note";
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidence: EvidenceRef[];
};
