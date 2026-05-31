-- OpenDinq initial schema.
-- Generated from packages/db/prisma/schema.prisma for local PostgreSQL.

CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdentitySource" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "externalId" TEXT,
    "rawJson" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentitySource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sourceId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "metadata" JSONB,
    "evidenceRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "dataJson" JSONB,
    "evidenceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SkillTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SkillTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonSkill" (
    "personId" TEXT NOT NULL,
    "skillTagId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "evidenceJson" JSONB NOT NULL,

    CONSTRAINT "PersonSkill_pkey" PRIMARY KEY ("personId","skillTagId")
);

CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "parsedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchResult" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,

    CONSTRAINT "SearchResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Person_handle_key" ON "Person"("handle");
CREATE UNIQUE INDEX "IdentitySource_type_url_key" ON "IdentitySource"("type", "url");
CREATE INDEX "IdentitySource_personId_idx" ON "IdentitySource"("personId");
CREATE UNIQUE INDEX "Artifact_personId_type_url_key" ON "Artifact"("personId", "type", "url");
CREATE INDEX "Artifact_personId_idx" ON "Artifact"("personId");
CREATE INDEX "Card_personId_idx" ON "Card"("personId");
CREATE UNIQUE INDEX "SkillTag_name_key" ON "SkillTag"("name");
CREATE INDEX "SearchResult_queryId_idx" ON "SearchResult"("queryId");
CREATE INDEX "SearchResult_personId_idx" ON "SearchResult"("personId");

ALTER TABLE "IdentitySource" ADD CONSTRAINT "IdentitySource_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Card" ADD CONSTRAINT "Card_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonSkill" ADD CONSTRAINT "PersonSkill_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonSkill" ADD CONSTRAINT "PersonSkill_skillTagId_fkey"
    FOREIGN KEY ("skillTagId") REFERENCES "SkillTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SearchResult" ADD CONSTRAINT "SearchResult_queryId_fkey"
    FOREIGN KEY ("queryId") REFERENCES "SearchQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
