/**
 * Fordeling af «Ring alle tildelte» mellem kampagnerne.
 *
 * Hver kampagne vægtes efter, hvor mange forsøg dens næste lead har: 1 / (1 + forsøg).
 * Kampagner med friske leads ringes mest, men alle kampagner med leads klar får mindst
 * DIAL_POOL_MIN_SHARE af opkaldene, så leads med mange forsøg ikke går helt i stå.
 *
 * Næste kampagne er den, der ligger længst under sin andel af sælgerens opkald i dag.
 * Det giver en jævn fordeling også over få opkald og overlever genindlæsning af siden.
 */

export const DIAL_POOL_MIN_SHARE = 0.05;

export type DialPoolCampaignCandidate = {
  id: string;
  /** unansweredAttempts på kampagnens næste lead i køen. */
  nextLeadAttempts: number;
};

export function dialPoolCampaignWeight(nextLeadAttempts: number): number {
  const a = Number.isFinite(nextLeadAttempts) ? Math.max(0, Math.floor(nextLeadAttempts)) : 0;
  return 1 / (1 + a);
}

/** Andel af opkaldene pr. kampagne (summerer til 1), med minimumsandel. */
export function dialPoolTargetShares(
  candidates: DialPoolCampaignCandidate[],
  minShare = DIAL_POOL_MIN_SHARE,
): Map<string, number> {
  const shares = new Map<string, number>();
  if (candidates.length === 0) return shares;
  if (candidates.length * minShare >= 1) {
    for (const c of candidates) shares.set(c.id, 1 / candidates.length);
    return shares;
  }
  // Løft kampagner under minimum til minimum, og fordel resten forholdsvist mellem de andre.
  // Gentag, da omfordelingen kan skubbe flere under minimum.
  const floored = new Set<string>();
  for (;;) {
    const free = candidates.filter((c) => !floored.has(c.id));
    const freeTotal = 1 - floored.size * minShare;
    const weightSum = free.reduce((s, c) => s + dialPoolCampaignWeight(c.nextLeadAttempts), 0);
    let changed = false;
    for (const c of free) {
      const share = (dialPoolCampaignWeight(c.nextLeadAttempts) / weightSum) * freeTotal;
      if (share < minShare) {
        floored.add(c.id);
        changed = true;
      }
    }
    if (!changed) {
      for (const c of free) {
        shares.set(c.id, (dialPoolCampaignWeight(c.nextLeadAttempts) / weightSum) * freeTotal);
      }
      for (const id of floored) shares.set(id, minShare);
      return shares;
    }
  }
}

/**
 * Kampagnerne i den rækkefølge, puljen skal prøve dem: størst underskud i forhold til
 * andelen først. Ved lige underskud bruges `tieOrder` (round-robin efter sidste kampagne).
 * Hele listen returneres, så puljen kan gå videre, hvis ingen leads kan reserveres i den første.
 */
export function orderDialPoolCampaignsByDeficit(
  candidates: DialPoolCampaignCandidate[],
  callsToday: ReadonlyMap<string, number>,
  tieOrder: string[],
): string[] {
  const shares = dialPoolTargetShares(candidates);
  const total = candidates.reduce((s, c) => s + (callsToday.get(c.id) ?? 0), 0) + 1;
  const tieIndex = new Map(tieOrder.map((id, i) => [id, i] as const));
  const deficit = (id: string) => (shares.get(id) ?? 0) * total - (callsToday.get(id) ?? 0);
  return [...candidates]
    .sort((a, b) => {
      const d = deficit(b.id) - deficit(a.id);
      if (Math.abs(d) > 1e-9) return d;
      return (tieIndex.get(a.id) ?? Infinity) - (tieIndex.get(b.id) ?? Infinity);
    })
    .map((c) => c.id);
}
