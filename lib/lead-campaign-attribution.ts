/**
 * Kampagne-attribution for scoreboard-hændelser: et lead flyttes til
 * systemkampagnen «Kommende møder» når et møde bookes, så leadets *aktuelle*
 * campaignId er misvisende for hændelser tidligere på dagen. Vi bruger i stedet
 * kampagnen fra det seneste kø-besøg (LeadVisitHistory) FØR hændelsen —
 * dvs. den kampagne sælgeren faktisk arbejdede i, da udfaldet blev gemt.
 */

export type LeadVisitForAttribution = {
  leadId: string;
  campaignId: string | null;
  visitedAt: Date;
};

export type LeadCampaignAttribution = {
  /** Kampagnen leadet var i på tidspunktet `at` — null hvis ukendt. */
  campaignIdAt(leadId: string, at: Date): string | null;
};

export function buildLeadCampaignAttribution(
  visits: LeadVisitForAttribution[],
): LeadCampaignAttribution {
  const byLead = new Map<string, LeadVisitForAttribution[]>();
  for (const v of visits) {
    if (!v.campaignId) continue;
    const arr = byLead.get(v.leadId) ?? [];
    arr.push(v);
    byLead.set(v.leadId, arr);
  }
  for (const arr of byLead.values()) {
    arr.sort((a, b) => a.visitedAt.getTime() - b.visitedAt.getTime());
  }

  return {
    campaignIdAt(leadId: string, at: Date): string | null {
      const arr = byLead.get(leadId);
      if (!arr || arr.length === 0) return null;
      // Seneste besøg ≤ at; hvis alle besøg ligger efter, brug det første
      // (leadet var i den kampagne før hændelsen blev registreret).
      let candidate: LeadVisitForAttribution | null = null;
      for (const v of arr) {
        if (v.visitedAt.getTime() <= at.getTime()) candidate = v;
        else break;
      }
      return (candidate ?? arr[0]!).campaignId;
    },
  };
}
