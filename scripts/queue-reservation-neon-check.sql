-- Read-only checks for campaign queue / re-reservation issues (run in Neon SQL editor or MCP run_sql).
-- Expectation: Query B should return 0 rows — no lead should stay NEW with latest outcome NOT_INTERESTED/UNQUALIFIED.

-- A) NEW leads whose *latest* outcome log is a "final" negative (would look like "already decided" in UI if shown again)
SELECT l."id",
       l."campaignId",
       l."status",
       l."updatedAt",
       o."status" AS last_log_status,
       o."createdAt" AS last_log_at
FROM "Lead" l
JOIN "LeadOutcomeLog" o ON o."leadId" = l."id"
  AND o."createdAt" = (SELECT MAX(o2."createdAt") FROM "LeadOutcomeLog" o2 WHERE o2."leadId" = l."id")
WHERE l."status" = 'NEW'
  AND o."status" IN ('NOT_INTERESTED', 'UNQUALIFIED')
ORDER BY o."createdAt" DESC;

-- B) Count of the above (should be 0)
SELECT COUNT(*)::int AS new_with_latest_final_negative
FROM "Lead" l
WHERE l."status" = 'NEW'
  AND EXISTS (
    SELECT 1
    FROM "LeadOutcomeLog" o
    WHERE o."leadId" = l."id"
      AND o."status" IN ('NOT_INTERESTED', 'UNQUALIFIED')
      AND o."createdAt" = (SELECT MAX(o2."createdAt") FROM "LeadOutcomeLog" o2 WHERE o2."leadId" = l."id")
  );

-- C) Optional: many reservations of same lead in a short window (investigate if count is high)
SELECT v."leadId", COUNT(*)::int AS visits_1h
FROM "LeadVisitHistory" v
WHERE v."visitedAt" > NOW() - INTERVAL '1 hour'
GROUP BY v."leadId"
HAVING COUNT(*) >= 3
ORDER BY visits_1h DESC
LIMIT 25;
