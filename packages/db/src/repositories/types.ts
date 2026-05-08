export type PersonInput = {
  handle: string;
  displayName: string;
  headline?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
};

export type IdentitySourceInput = {
  personId: string;
  type: string;
  url: string;
  externalId?: string;
  rawJson?: unknown;
  verifiedAt?: Date;
};

export type ArtifactInput = {
  personId: string;
  sourceId?: string;
  type: string;
  title: string;
  description?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  evidenceRaw?: unknown;
};

export type CardInput = {
  personId: string;
  type: string;
  title: string;
  contentMd: string;
  dataJson?: Record<string, unknown>;
  evidenceJson: unknown;
};

export type PrismaRepositoryClient = {
  person: {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    findMany(args?: unknown): Promise<unknown[]>;
  };
  identitySource: {
    upsert(args: unknown): Promise<unknown>;
  };
  artifact: {
    findFirst(args: unknown): Promise<unknown | null>;
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  card: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
  };
};

