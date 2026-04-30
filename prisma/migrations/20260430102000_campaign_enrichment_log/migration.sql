-- CreateTable
CREATE TABLE "CampaignEnrichmentLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "matchField" TEXT NOT NULL,
    "overwriteExisting" BOOLEAN NOT NULL DEFAULT false,
    "uploadedRows" INTEGER NOT NULL,
    "matchedRows" INTEGER NOT NULL,
    "updatedLeads" INTEGER NOT NULL,
    "fieldsAdded" INTEGER NOT NULL,
    "fieldsOverwritten" INTEGER NOT NULL,
    "fieldsUnchanged" INTEGER NOT NULL,
    "unmatchedRows" INTEGER NOT NULL,
    "duplicateUploadRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEnrichmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignEnrichmentLog_campaignId_createdAt_idx" ON "CampaignEnrichmentLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignEnrichmentLog_userId_createdAt_idx" ON "CampaignEnrichmentLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CampaignEnrichmentLog" ADD CONSTRAINT "CampaignEnrichmentLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEnrichmentLog" ADD CONSTRAINT "CampaignEnrichmentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
