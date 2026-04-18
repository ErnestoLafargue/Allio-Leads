-- Eksisterende «ikke hjemme» uden markeringstid: brug seneste opdatering så 6-timers reglen kan gælde.
UPDATE "Lead"
SET "notHomeMarkedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'NOT_HOME'
  AND "notHomeMarkedAt" IS NULL;
