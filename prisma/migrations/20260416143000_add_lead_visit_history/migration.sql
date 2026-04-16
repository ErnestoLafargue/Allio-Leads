-- CreateTable
CREATE TABLE "LeadVisitHistory" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "companyName" TEXT NOT NULL,
    "statusAtVisit" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadVisitHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadVisitHistory_userId_visitedAt_idx" ON "LeadVisitHistory"("userId", "visitedAt");

-- CreateIndex
CREATE INDEX "LeadVisitHistory_userId_dayKey_visitedAt_idx" ON "LeadVisitHistory"("userId", "dayKey", "visitedAt");

-- CreateIndex
CREATE INDEX "LeadVisitHistory_leadId_visitedAt_idx" ON "LeadVisitHistory"("leadId", "visitedAt");

-- CreateIndex
CREATE INDEX "LeadVisitHistory_campaignId_visitedAt_idx" ON "LeadVisitHistory"("campaignId", "visitedAt");

-- AddForeignKey
ALTER TABLE "LeadVisitHistory" ADD CONSTRAINT "LeadVisitHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadVisitHistory" ADD CONSTRAINT "LeadVisitHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadVisitHistory" ADD CONSTRAINT "LeadVisitHistory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
