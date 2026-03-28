import type { LeadStatus } from "./lead-status";
import { isLeadStatus } from "./lead-status";

/**
 * Lavere tal = tidligere i arbejdskøen (nye / ikke-afsluttede leads først).
 */
export const LEAD_QUEUE_ORDER: Record<LeadStatus, number> = {
  NEW: 0,
  VOICEMAIL: 1,
  NOT_HOME: 2,
  NOT_INTERESTED: 3,
  MEETING_BOOKED: 4,
};

export function queueRank(status: string): number {
  if (isLeadStatus(status)) return LEAD_QUEUE_ORDER[status];
  return 99;
}

/**
 * Leads der ikke hører til opkaldskø/kø-navigation på kampagne:
 * afsluttet (ikke interesseret, møde booket), voicemail/ikke hjemme (venter på genåbning).
 */
export function isQueueEligibleStatus(status: string): boolean {
  return (
    status !== "NOT_INTERESTED" &&
    status !== "MEETING_BOOKED" &&
    status !== "VOICEMAIL" &&
    status !== "NOT_HOME"
  );
}

export function sortLeadsForQueue<T extends { status: string; updatedAt: string }>(leads: T[]): T[] {
  return [...leads].sort((a, b) => {
    const ra = queueRank(a.status);
    const rb = queueRank(b.status);
    if (ra !== rb) return ra - rb;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });
}

/**
 * Opkaldskø på kampagne-arbejde: samme status-rækkefølge, men stabilt bindeled (senest tilføjet først + id)
 * så et gem ikke flytter leadet foran de andre — undgår at «Næste» afslutter for tidligt eller springer leads over.
 */
export function sortLeadsForCampaignCallQueue<
  T extends { status: string; importedAt: string; id: string },
>(leads: T[]): T[] {
  return [...leads].sort((a, b) => {
    const ra = queueRank(a.status);
    const rb = queueRank(b.status);
    if (ra !== rb) return ra - rb;
    const ta = new Date(a.importedAt).getTime();
    const tb = new Date(b.importedAt).getTime();
    if (ta !== tb) return tb - ta;
    return a.id.localeCompare(b.id);
  });
}
