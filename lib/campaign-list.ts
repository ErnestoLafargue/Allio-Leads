export type CampaignListItem = {
  id: string;
  name: string;
  includeProtectedBusinesses: boolean;
  includeLeadsWithoutPhone: boolean;
  isSystemCampaign: boolean;
  systemCampaignType: string | null;
  dialMode: string | null;
  createdAt: string;
  updatedAt: string;
  agentsOnline: number;
  myCallbacks: number;
  _count: { leads: number };
};

export const CAMPAIGN_LIST_SELECT = {
  id: true,
  name: true,
  includeProtectedBusinesses: true,
  includeLeadsWithoutPhone: true,
  isSystemCampaign: true,
  systemCampaignType: true,
  dialMode: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CampaignListCountRow = {
  campaignId: string | null;
  _count: { _all: number };
};

export function countsByCampaignId(rows: CampaignListCountRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.campaignId === "string") {
      map.set(r.campaignId, r._count._all);
    }
  }
  return map;
}

export function attachCampaignListStats(
  campaigns: Array<{
    id: string;
    name: string;
    includeProtectedBusinesses: boolean;
    includeLeadsWithoutPhone: boolean;
    isSystemCampaign: boolean;
    systemCampaignType: string | null;
    dialMode: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  leadCounts: Map<string, number>,
  agentsByCampaign: Map<string, number>,
  callbacksByCampaign: Map<string, number>,
): CampaignListItem[] {
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    includeProtectedBusinesses: c.includeProtectedBusinesses,
    includeLeadsWithoutPhone: c.includeLeadsWithoutPhone,
    isSystemCampaign: c.isSystemCampaign,
    systemCampaignType: c.systemCampaignType,
    dialMode: c.dialMode,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    agentsOnline: agentsByCampaign.get(c.id) ?? 0,
    myCallbacks: callbacksByCampaign.get(c.id) ?? 0,
    _count: { leads: leadCounts.get(c.id) ?? 0 },
  }));
}
