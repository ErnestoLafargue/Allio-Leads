-- Tilføj kolonne der auto-skjuler ticket fra dagskalenderen indtil et givent tidspunkt
ALTER TABLE "Ticket"
ADD COLUMN "hiddenFromDailyUntil" TIMESTAMP(3);

CREATE INDEX "Ticket_assignedUserId_hiddenFromDailyUntil_idx"
ON "Ticket"("assignedUserId", "hiddenFromDailyUntil");
