-- Profile generator runtime objects

CREATE TABLE "ProfileGenerationRun" (
  "id" TEXT NOT NULL,
  "personId" TEXT,
  "targetHandle" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "inputJson" JSONB NOT NULL,
  "sourceSummaryJson" JSONB,
  "warningsJson" JSONB,
  "errorJson" JSONB,
  "generatedProfileHandle" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfileGenerationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfileSource" (
  "id" TEXT NOT NULL,
  "personId" TEXT,
  "runId" TEXT,
  "type" TEXT NOT NULL,
  "url" TEXT,
  "status" TEXT NOT NULL,
  "rawJson" JSONB,
  "normalizedJson" JSONB,
  "warningsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfileSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfileClaim" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "sourceId" TEXT,
  "artifactId" TEXT,
  "type" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "evidenceJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfileClaim_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Card" ADD COLUMN "sourceIds" JSONB;
ALTER TABLE "Card" ADD COLUMN "claimIds" JSONB;
ALTER TABLE "Card" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "Card" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "Card" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ProfileGenerationRun_targetHandle_idx" ON "ProfileGenerationRun"("targetHandle");
CREATE INDEX "ProfileGenerationRun_status_idx" ON "ProfileGenerationRun"("status");
CREATE INDEX "ProfileSource_personId_idx" ON "ProfileSource"("personId");
CREATE INDEX "ProfileSource_runId_idx" ON "ProfileSource"("runId");
CREATE INDEX "ProfileSource_type_idx" ON "ProfileSource"("type");
CREATE INDEX "ProfileClaim_personId_idx" ON "ProfileClaim"("personId");
CREATE INDEX "ProfileClaim_sourceId_idx" ON "ProfileClaim"("sourceId");
CREATE INDEX "ProfileClaim_artifactId_idx" ON "ProfileClaim"("artifactId");

ALTER TABLE "ProfileGenerationRun" ADD CONSTRAINT "ProfileGenerationRun_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfileSource" ADD CONSTRAINT "ProfileSource_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileSource" ADD CONSTRAINT "ProfileSource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProfileGenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfileClaim" ADD CONSTRAINT "ProfileClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileClaim" ADD CONSTRAINT "ProfileClaim_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProfileSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfileClaim" ADD CONSTRAINT "ProfileClaim_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
