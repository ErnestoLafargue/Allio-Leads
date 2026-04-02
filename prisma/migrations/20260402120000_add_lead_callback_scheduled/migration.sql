-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "callbackScheduledFor" TIMESTAMP(3),
ADD COLUMN "callbackReservedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_callbackReservedByUserId_fkey" FOREIGN KEY ("callbackReservedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Lead_campaignId_callbackReservedByUserId_callbackScheduledFor_idx" ON "Lead"("campaignId", "callbackReservedByUserId", "callbackScheduledFor");
