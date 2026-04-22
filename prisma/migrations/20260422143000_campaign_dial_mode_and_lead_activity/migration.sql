-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "dialMode" TEXT NOT NULL DEFAULT 'NO_DIAL';

-- CreateTable
CREATE TABLE "LeadActivityEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recordingUrl" TEXT,
    "durationSeconds" INTEGER,
    "telnyxCallLegId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadActivityEvent_leadId_createdAt_idx" ON "LeadActivityEvent"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadActivityEvent" ADD CONSTRAINT "LeadActivityEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivityEvent" ADD CONSTRAINT "LeadActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
