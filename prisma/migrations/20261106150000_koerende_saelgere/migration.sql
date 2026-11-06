-- Flere kørende sælgere: kalender pr. sælger, prioritet ved tildeling og kobling til Podio/Allio-Native.
ALTER TABLE "User" ADD COLUMN "isDrivingSeller" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "sellerPriority" INTEGER;
ALTER TABLE "User" ADD COLUMN "podioSellerItemId" INTEGER;
ALTER TABLE "User" ADD COLUMN "allioNativeEmployeeId" TEXT;

ALTER TABLE "AllioNativeOccupancy" ADD COLUMN "employeeId" TEXT;

-- Victor (prioritet 1) og Ernesto (prioritet 2) er kørende sælgere fra start.
UPDATE "User" SET "isDrivingSeller" = true, "sellerPriority" = 1
WHERE lower("username") = 'victor@allio.dk' OR lower(btrim("name")) = 'victor lafargue';

UPDATE "User" SET "isDrivingSeller" = true, "sellerPriority" = 2
WHERE lower("username") = 'ernesto';

-- Kommende møder uden sælger har hidtil reelt været Victors (eneste mødeansvarlige) — gør det eksplicit,
-- så «Ingen tildelt» fremover betyder et aktivt valg.
UPDATE "Lead" SET "assignedUserId" = v."id"
FROM (
  SELECT "id" FROM "User"
  WHERE lower("username") = 'victor@allio.dk' OR lower(btrim("name")) = 'victor lafargue'
  ORDER BY "createdAt" LIMIT 1
) v
WHERE "Lead"."status" = 'MEETING_BOOKED'
  AND "Lead"."meetingOutcomeStatus" = 'PENDING'
  AND "Lead"."assignedUserId" IS NULL;
