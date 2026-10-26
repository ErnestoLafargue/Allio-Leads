-- AlterTable
ALTER TABLE "LeadActivityEvent" ADD COLUMN IF NOT EXISTS "mailTo" TEXT;
ALTER TABLE "LeadActivityEvent" ADD COLUMN IF NOT EXISTS "mailSubject" TEXT;
ALTER TABLE "LeadActivityEvent" ADD COLUMN IF NOT EXISTS "mailBody" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadActivityEvent_leadId_kind_createdAt_idx" ON "LeadActivityEvent"("leadId", "kind", "createdAt");
