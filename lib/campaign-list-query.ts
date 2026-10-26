import { prisma } from "@/lib/prisma";
import { campaignWhereForUser, type SessionUserLike } from "@/lib/campaign-access";
import { sortCampaignsForDisplay } from "@/lib/campaign-list-sort";
import { workableCampaignLeadsWhere } from "@/lib/campaign-workable-leads";
import { PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";
import {
  attachCampaignListStats,
  CAMPAIGN_LIST_SELECT,
  countsByCampaignId,
  type CampaignListCountRow,
  type CampaignListItem,
} from "@/lib/campaign-list";

const LEAD_COUNT_TTL_MS = 10_000;

let leadCountCache: { expiresAt: number; byCampaign: Map<string, number> } | null = null;

async function workableLeadCountsByCampaign(): Promise<Map<string, number>> {
  const now = Date.now();
  if (leadCountCache && leadCountCache.expiresAt > now) {
    return leadCountCache.byCampaign;
  }
  const rows = await prisma.lead.groupBy({
    by: ["campaignId"],
    where: {
      campaignId: { not: null },
      ...workableCampaignLeadsWhere,
    },
    _count: { _all: true },
  });
  const byCampaign = countsByCampaignId(rows);
  leadCountCache = { expiresAt: now + LEAD_COUNT_TTL_MS, byCampaign };
  return byCampaign;
}

/**
 * Kampagneliste til Start-siden og GET /api/campaigns.
 * Lead-optælling er ét GROUP BY (ikke correlated `_count` pr. kampagne),
 * og kører parallelt med agent-/genopkalds-optælling. `fieldConfig` udelades —
 * den hentes på kampagne-detalje når den skal bruges.
 */
export async function listCampaignsWithStats(user: SessionUserLike): Promise<CampaignListItem[]> {
  const where = campaignWhereForUser(user);
  const userId = user?.id ?? "";
  const presenceCutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);

  const [rows, leadCounts, agentRows, callbackRows] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { name: "asc" },
      select: CAMPAIGN_LIST_SELECT,
    }),
    workableLeadCountsByCampaign(),
    prisma.agentSession
      .groupBy({
        by: ["campaignId"],
        where: {
          status: { in: ["ready", "ringing", "talking", "wrap_up"] },
          lastHeartbeat: { gte: presenceCutoff },
        },
        _count: { _all: true },
      })
      .catch(() => [] as { campaignId: string; _count: { _all: number } }[]),
    userId
      ? prisma.lead
          .groupBy({
            by: ["campaignId"],
            where: {
              callbackReservedByUserId: userId,
              callbackStatus: "PENDING",
            },
            _count: { _all: true },
          })
          .catch(() => [] as CampaignListCountRow[])
      : Promise.resolve([] as CampaignListCountRow[]),
  ]);

  return attachCampaignListStats(
    sortCampaignsForDisplay(rows),
    leadCounts,
    countsByCampaignId(agentRows),
    countsByCampaignId(callbackRows),
  );
}
