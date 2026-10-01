-- AlterTable
ALTER TABLE "UserCampaignPresenceDay" ADD COLUMN "ringSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserCampaignPresenceDay" ADD COLUMN "talkLineSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserCampaignPresenceDay" ADD COLUMN "linePhase" TEXT;
ALTER TABLE "UserCampaignPresenceDay" ADD COLUMN "lineLastSeenAt" TIMESTAMP(3);
