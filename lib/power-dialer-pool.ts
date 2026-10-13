/**
 * Pure helpers for «Power: alle tildelte» — ratio, claim-plan og kø-sortering på tværs
 * af flere Power-kampagner.
 */

import { compareLeadQueueOrder } from "@/lib/lead-queue";
import type { PowerDialerCandidate } from "@/lib/power-dialer-batch";
import type { PowerDialerSettings } from "@/lib/power-dialer-settings";

/** Højeste dialRatio blandt pulje-kampagnerne (én klar sælger, fyld linjen). */
export function pickPowerPoolDialRatio(settingsList: Pick<PowerDialerSettings, "dialRatio">[]): number {
  if (settingsList.length === 0) return 1;
  return Math.max(1, ...settingsList.map((s) => s.dialRatio));
}

export function sortPowerPoolCandidates(candidates: PowerDialerCandidate[]): PowerDialerCandidate[] {
  return [...candidates].sort((a, b) =>
    compareLeadQueueOrder(
      {
        id: a.leadId,
        status: "NEW",
        importedAt: a.importedAt.toISOString(),
        lastDialAttemptAt: a.lastDialAttemptAt?.toISOString(),
        lastOutcomeAt: a.lastOutcomeAt?.toISOString(),
        unansweredAttempts: a.unansweredAttempts,
      },
      {
        id: b.leadId,
        status: "NEW",
        importedAt: b.importedAt.toISOString(),
        lastDialAttemptAt: b.lastDialAttemptAt?.toISOString(),
        lastOutcomeAt: b.lastOutcomeAt?.toISOString(),
        unansweredAttempts: b.unansweredAttempts,
      },
    ),
  );
}

/**
 * Vælg op til `newCallsNeeded` kandidater uden at overskride pr. kampagnes ledige
 * maxInFlight-plads (`roomByCampaign`).
 */
export function planPowerPoolClaims(
  candidates: PowerDialerCandidate[],
  roomByCampaign: Map<string, number>,
  newCallsNeeded: number,
): PowerDialerCandidate[] {
  if (newCallsNeeded <= 0) return [];
  const room = new Map(roomByCampaign);
  const out: PowerDialerCandidate[] = [];
  for (const c of candidates) {
    if (out.length >= newCallsNeeded) break;
    const left = room.get(c.campaignId) ?? 0;
    if (left <= 0) continue;
    out.push(c);
    room.set(c.campaignId, left - 1);
  }
  return out;
}

export function groupCandidatesByCampaign(
  candidates: PowerDialerCandidate[],
): Map<string, PowerDialerCandidate[]> {
  const by = new Map<string, PowerDialerCandidate[]>();
  for (const c of candidates) {
    const list = by.get(c.campaignId);
    if (list) list.push(c);
    else by.set(c.campaignId, [c]);
  }
  return by;
}
