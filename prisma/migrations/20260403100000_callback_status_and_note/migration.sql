-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "callbackStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Lead" ADD COLUMN "callbackNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Lead" ADD COLUMN "callbackCreatedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_callbackCreatedByUserId_fkey" FOREIGN KEY ("callbackCreatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
