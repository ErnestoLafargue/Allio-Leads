-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "maxContactAttempts" INTEGER;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "unansweredAttempts" INTEGER NOT NULL DEFAULT 0;

-- Backfill fra historiske VOICEMAIL / NOT_HOME udfald
UPDATE "Lead"
SET "unansweredAttempts" = sub.cnt
FROM (
  SELECT "leadId", COUNT(*)::int AS cnt
  FROM "LeadOutcomeLog"
  WHERE status IN ('VOICEMAIL', 'NOT_HOME')
  GROUP BY "leadId"
) AS sub
WHERE "Lead".id = sub."leadId";

-- CreateIndex
CREATE INDEX "Lead_unansweredAttempts_idx" ON "Lead"("unansweredAttempts");

-- CreateIndex
CREATE INDEX "Lead_campaignId_unansweredAttempts_idx" ON "Lead"("campaignId", "unansweredAttempts");
