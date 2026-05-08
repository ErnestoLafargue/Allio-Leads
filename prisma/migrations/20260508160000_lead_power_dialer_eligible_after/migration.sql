-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "powerDialerEligibleAfter" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_campaignId_powerDialerEligibleAfter_idx" ON "Lead"("campaignId", "powerDialerEligibleAfter");
