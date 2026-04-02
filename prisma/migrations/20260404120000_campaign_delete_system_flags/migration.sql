-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "isSystemCampaign" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "systemCampaignType" TEXT;

-- Mark meeting-flow system campaigns (by exact name) for existing databases
UPDATE "Campaign" SET "isSystemCampaign" = true, "systemCampaignType" = 'upcoming_meetings' WHERE name = 'Kommende møder';
UPDATE "Campaign" SET "isSystemCampaign" = true, "systemCampaignType" = 'rebooking' WHERE name = 'Genbook møder';
UPDATE "Campaign" SET "isSystemCampaign" = true, "systemCampaignType" = 'active_customers' WHERE name = 'Aktive kunder';
UPDATE "Campaign" SET "isSystemCampaign" = true, "systemCampaignType" = 'direct_booking' WHERE name = 'Direkte møder';

-- Allow leads to outlive a deleted campaign (FK → SET NULL)
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_campaignId_fkey";
ALTER TABLE "Lead" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
