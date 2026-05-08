import type { PrismaClient } from "@prisma/client";
import type { DialerClientState } from "@/lib/dialer-shared";
import { normalizeCampaignDialMode, type CampaignDialMode } from "@/lib/dial-mode";

/** Bruges i Telnyx-webhooks: v2 lead har dialMode inline; v1 lead slår op på kampagnen. */
export async function resolveParallelDialModeFromClientState(
  prisma: PrismaClient,
  clientState: DialerClientState | null,
): Promise<CampaignDialMode | null> {
  if (!clientState) return null;
  if (clientState.v === 2 && clientState.kind === "lead") {
    return normalizeCampaignDialMode(clientState.dialMode);
  }
  if (clientState.v === 1 && clientState.kind === "lead") {
    const c = await prisma.campaign.findUnique({
      where: { id: clientState.campaignId },
      select: { dialMode: true },
    });
    return c ? normalizeCampaignDialMode(c.dialMode) : null;
  }
  return null;
}
