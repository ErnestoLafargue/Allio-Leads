import type { LeadStatus } from "./lead-status";
import { isLeadStatus } from "./lead-status";

/**
 * Lavere tal = tidligere i arbejdskøen (nye / ikke-afsluttede leads først).
 */
export const LEAD_QUEUE_ORDER: Record<LeadStatus, number> = {
  NEW: 0,
  CALLBACK_SCHEDULED: 0,
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
 * afsluttet (ikke interesseret, møde booket), voicemail/ikke hjemme (venter på genåbning), planlagt callback.
 */
export function isQueueEligibleStatus(status: string): boolean {
  return (
    status !== "NOT_INTERESTED" &&
    status !== "MEETING_BOOKED" &&
    status !== "VOICEMAIL" &&
    status !== "NOT_HOME" &&
    status !== "CALLBACK_SCHEDULED"
  );
}

type QueueOrderFields = {
  status: string;
  importedAt: string;
  id: string;
  hasOutcomeLogToday?: boolean;
};

/** Fælles sortering: status-rang → uden udfaldslog i dag først → senest importeret → id */
export function compareLeadQueueOrder(a: QueueOrderFields, b: QueueOrderFields): number {
  const ra = queueRank(a.status);
  const rb = queueRank(b.status);
  if (ra !== rb) return ra - rb;
  const ha = a.hasOutcomeLogToday === true ? 1 : 0;
  const hb = b.hasOutcomeLogToday === true ? 1 : 0;
  if (ha !== hb) return ha - hb;
  const ta = new Date(a.importedAt).getTime();
  const tb = new Date(b.importedAt).getTime();
  if (ta !== tb) return tb - ta;
  return a.id.localeCompare(b.id);
}

export function sortLeadsForQueue<T extends QueueOrderFields>(leads: T[]): T[] {
  return [...leads].sort(compareLeadQueueOrder);
}

/**
 * Opkaldskø på kampagne-arbejde: samme status-rækkefølge, men stabilt bindeled (senest tilføjet først + id)
 * så et gem ikke flytter leadet foran de andre — undgår at «Næste» afslutter for tidligt eller springer leads over.
 * Leads med udfaldslog i dag (København) kommer efter dem uden.
 */
export function sortLeadsForCampaignCallQueue<T extends QueueOrderFields & { hasOutcomeLogToday: boolean }>(
  leads: T[],
): T[] {
  return [...leads].sort(compareLeadQueueOrder);
}
