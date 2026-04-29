-- Internt ticketsystem (opgavestyring) - uafhængigt af leads/møder.
CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'open',
  "deadline" TIMESTAMP(3),
  "assignedUserId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Ticket_assignedUserId_status_deadline_idx"
ON "Ticket"("assignedUserId", "status", "deadline");

CREATE INDEX "Ticket_status_deadline_idx"
ON "Ticket"("status", "deadline");

CREATE INDEX "Ticket_createdByUserId_idx"
ON "Ticket"("createdByUserId");

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
