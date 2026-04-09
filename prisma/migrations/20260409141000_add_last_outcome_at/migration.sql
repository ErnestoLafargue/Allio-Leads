-- Track latest real outcome change across all leads.
ALTER TABLE "Lead"
ADD COLUMN "lastOutcomeAt" TIMESTAMP(3);

CREATE INDEX "Lead_lastOutcomeAt_idx" ON "Lead"("lastOutcomeAt");
