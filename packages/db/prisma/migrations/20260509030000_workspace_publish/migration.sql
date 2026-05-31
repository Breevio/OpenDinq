ALTER TABLE "Person" ADD COLUMN "publicStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Person" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "Person" ADD COLUMN "shareSlug" TEXT;
CREATE INDEX "Person_publicStatus_idx" ON "Person"("publicStatus");
CREATE INDEX "Person_shareSlug_idx" ON "Person"("shareSlug");

ALTER TABLE "ProfileClaim" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'approved';
