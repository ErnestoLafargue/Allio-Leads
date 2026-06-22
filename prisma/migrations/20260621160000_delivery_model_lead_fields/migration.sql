-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "calComBookingUid" TEXT;
ALTER TABLE "Lead" ADD COLUMN "calComMeetingUrl" TEXT;
ALTER TABLE "Lead" ADD COLUMN "welcomeMailSentAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "geckoMailSentAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "podioItemId" TEXT;
