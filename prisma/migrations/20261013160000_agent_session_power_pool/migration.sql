-- AlterTable
ALTER TABLE "AgentSession" ADD COLUMN "powerPool" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AgentSession_userId_powerPool_idx" ON "AgentSession"("userId", "powerPool");
