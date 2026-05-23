-- CreateTable
CREATE TABLE "CampaignImportLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "newLeadsImported" INTEGER NOT NULL,
    "existingAttached" INTEGER NOT NULL,
    "overwriteMatchedCvrs" INTEGER NOT NULL DEFAULT 0,
    "protectedCvrsSkipped" INTEGER NOT NULL DEFAULT 0,
    "replacedLeadsDeleted" INTEGER NOT NULL DEFAULT 0,
    "skippedDuplicateInFile" INTEGER NOT NULL DEFAULT 0,
    "skippedAlreadyInCampaign" INTEGER NOT NULL DEFAULT 0,
    "skippedInvalid" INTEGER NOT NULL DEFAULT 0,
    "attachExistingCvrsToCampaign" BOOLEAN NOT NULL DEFAULT false,
    "importDuplicateCvrs" BOOLEAN NOT NULL DEFAULT false,
    "overwriteExistingCvrs" BOOLEAN NOT NULL DEFAULT false,
    "allowMissingCvr" BOOLEAN NOT NULL DEFAULT false,
    "allowMissingCompanyName" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignImportLog_campaignId_createdAt_idx" ON "CampaignImportLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignImportLog_userId_createdAt_idx" ON "CampaignImportLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CampaignImportLog" ADD CONSTRAINT "CampaignImportLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportLog" ADD CONSTRAINT "CampaignImportLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
