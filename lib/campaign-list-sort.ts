/**
 * Fast rækkefølge øverst på kampagnelisten (resten sorteres alfabetisk på navn).
 * 1: Aktive kunder — 2: Kommende møder — 3: Genbook møde
 */
const PINNED_SYSTEM_ORDER: Record<string, number> = {
  active_customers: 0,
  upcoming_meetings: 1,
  rebooking: 2,
};

const REST = 1000;

export function sortCampaignsForDisplay<
  T extends { name: string; systemCampaignType: string | null },
>(campaigns: T[]): T[] {
  return [...campaigns].sort((a, b) => {
    const pa =
      a.systemCampaignType != null && PINNED_SYSTEM_ORDER[a.systemCampaignType] !== undefined
        ? PINNED_SYSTEM_ORDER[a.systemCampaignType]!
        : REST;
    const pb =
      b.systemCampaignType != null && PINNED_SYSTEM_ORDER[b.systemCampaignType] !== undefined
        ? PINNED_SYSTEM_ORDER[b.systemCampaignType]!
        : REST;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name, "da");
  });
}
