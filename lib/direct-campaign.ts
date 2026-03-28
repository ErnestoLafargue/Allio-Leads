import { prisma } from "@/lib/prisma";
import { defaultCampaignFieldConfigJson } from "@/lib/campaign-fields";

export const DIRECT_BOOKING_CAMPAIGN_NAME = "Direkte møder";

export async function ensureDirectBookingCampaign() {
  const existing = await prisma.campaign.findFirst({
    where: { name: DIRECT_BOOKING_CAMPAIGN_NAME },
  });
  if (existing) return existing;
  return prisma.campaign.create({
    data: {
      name: DIRECT_BOOKING_CAMPAIGN_NAME,
      fieldConfig: defaultCampaignFieldConfigJson(),
    },
  });
}
