-- Backfill lastOutcomeAt from historical outcome data.
-- 1) Preferred source: outcome logs (exact outcome-change timestamps).
UPDATE "Lead" l
SET "lastOutcomeAt" = x."maxCreatedAt"
FROM (
  SELECT "leadId", MAX("createdAt") AS "maxCreatedAt"
  FROM "LeadOutcomeLog"
  GROUP BY "leadId"
) x
WHERE l."id" = x."leadId"
  AND (l."lastOutcomeAt" IS NULL OR l."lastOutcomeAt" < x."maxCreatedAt");

-- 2) Fallbacks for older rows that may predate outcome logging.
UPDATE "Lead"
SET "lastOutcomeAt" = "meetingBookedAt"
WHERE "lastOutcomeAt" IS NULL
  AND "meetingBookedAt" IS NOT NULL;

UPDATE "Lead"
SET "lastOutcomeAt" = "voicemailMarkedAt"
WHERE "lastOutcomeAt" IS NULL
  AND "voicemailMarkedAt" IS NOT NULL;

UPDATE "Lead"
SET "lastOutcomeAt" = "notHomeMarkedAt"
WHERE "lastOutcomeAt" IS NULL
  AND "notHomeMarkedAt" IS NOT NULL;

-- NOT_INTERESTED has no dedicated timestamp column; updatedAt is the best available historical proxy.
UPDATE "Lead"
SET "lastOutcomeAt" = "updatedAt"
WHERE "lastOutcomeAt" IS NULL
  AND "status" = 'NOT_INTERESTED';
