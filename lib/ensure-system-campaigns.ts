import { prisma } from "@/lib/prisma";
import { defaultCampaignFieldConfigJson } from "@/lib/campaign-fields";

const DEFS = [
  { systemCampaignType: "upcoming_meetings" as const, name: "Kommende møder" },
  { systemCampaignType: "rebooking" as const, name: "Genbook møde" },
  { systemCampaignType: "active_customers" as const, name: "Aktive kunder" },
] as const;

export type SystemCampaignTypeKey = (typeof DEFS)[number]["systemCampaignType"];

/**
 * Sikrer at systemkampagnen findes (opretter ved behov). Bruges til møde-routing.
 */
export async function ensureSystemCampaignId(type: SystemCampaignTypeKey): Promise<string> {
  const found = await prisma.campaign.findFirst({
    where: { systemCampaignType: type },
    select: { id: true },
  });
  if (found) return found.id;
  const def = DEFS.find((d) => d.systemCampaignType === type)!;
  const created = await prisma.campaign.create({
    data: {
      name: def.name,
      fieldConfig: defaultCampaignFieldConfigJson(),
      isSystemCampaign: true,
      systemCampaignType: type,
    },
    select: { id: true },
  });
  return created.id;
}

export async function ensureStandardCampaignId(): Promise<string | null> {
  const c = await prisma.campaign.findFirst({
    where: { name: "Standard" },
    select: { id: true },
  });
  return c?.id ?? null;
}
