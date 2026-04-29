ALTER TABLE "Ticket"
ADD COLUMN "snoozedUntil" TIMESTAMP(3);

CREATE INDEX "Ticket_assignedUserId_snoozedUntil_idx"
ON "Ticket"("assignedUserId", "snoozedUntil");
