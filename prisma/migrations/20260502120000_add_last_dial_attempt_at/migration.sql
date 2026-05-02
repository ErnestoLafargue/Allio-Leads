-- Tilføj sporing af seneste outbound dial-forsøg pr. lead, så predictive/power-køen
-- kan deprioritere leads der allerede er ringet til (selv uden gemt udfald).
ALTER TABLE "Lead" ADD COLUMN "lastDialAttemptAt" TIMESTAMP(3);

CREATE INDEX "Lead_campaignId_status_lastDialAttemptAt_idx"
  ON "Lead"("campaignId", "status", "lastDialAttemptAt");

-- Backfill: alle leads med tidligere outbound-lead opkald får sat
-- lastDialAttemptAt til seneste startedAt — så loop-leads stopper ved deploy.
UPDATE "Lead" l SET "lastDialAttemptAt" = sub.max_started
FROM (
  SELECT "leadId", MAX("startedAt") AS max_started
  FROM "DialerCallLog"
  WHERE "leadId" IS NOT NULL AND "direction" = 'outbound-lead'
  GROUP BY "leadId"
) sub
WHERE l."id" = sub."leadId";
