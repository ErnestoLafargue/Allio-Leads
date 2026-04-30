-- AlterTable
ALTER TABLE "Ticket"
ADD COLUMN "isShared" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Ticket_isShared_status_deadline_idx" ON "Ticket"("isShared", "status", "deadline");
