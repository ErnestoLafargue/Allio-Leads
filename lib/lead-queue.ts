import type { LeadStatus } from "./lead-status";
import { isLeadStatus } from "./lead-status";
import type { CampaignDialMode } from "./dial-mode";
import {
  MEETING_OUTCOME_REBOOK,
  normalizeMeetingOutcomeStatus,
} from "./meeting-outcome";

/**
 * Lavere tal = tidligere i arbejdskøen (nye / ikke-afsluttede leads først).
 */
export const LEAD_QUEUE_ORDER: Record<LeadStatus, number> = {
  NEW: 0,
  CALLBACK_SCHEDULED: 0,
  VOICEMAIL: 1,
  NOT_HOME: 2,
  NOT_INTERESTED: 3,
  UNQUALIFIED: 3,
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
    status !== "UNQUALIFIED" &&
    status !== "MEETING_BOOKED" &&
    status !== "VOICEMAIL" &&
    status !== "NOT_HOME" &&
    status !== "CALLBACK_SCHEDULED"
  );
}

/**
 * Genbook «Genbook møde» / reserve-next: kun «Ny» eller genbook-markeret møde (stadig booket) skal kunne trækkes som næste lead.
 * Ikke interesseret m.m. skal aldrig tilbage i opkaldskøen, men leadet forbinder på kampagne (ses i kampagne-layout).
 */
export function isLeadInRebookingDialerPool(row: {
  status: string;
  meetingOutcomeStatus: string | null;
}): boolean {
  const st = String(row.status ?? "").trim().toUpperCase();
  if (st === "NOT_INTERESTED" || st === "UNQUALIFIED") return false;
  if (st === "NEW") return true;
  if (st === "MEETING_BOOKED") {
    return normalizeMeetingOutcomeStatus(row.meetingOutcomeStatus ?? "") === MEETING_OUTCOME_REBOOK;
  }
  return false;
}

/**
 * Rækker vist i kampagne-tabellen under Power / Predictive skal følge **samme pulje** som
 * `reserve-next` (kun «Ny» uden hængende callback-metadata), ellers ender voicemail / ikke hjemme
 * m.m. i sorteringskøen og ser ud som næste at ringe til — selv om serveren kun reserverer NEW.
 * Genbooking-kampagnen bruger rebooking-dialer-puljen.
 */
export function isLeadInPowerPredictiveCampaignTable(
  l: {
    status: string;
    meetingOutcomeStatus?: string | null;
    callbackScheduledFor?: string | null;
    callbackReservedByUserId?: string | null;
  },
  dialMode: CampaignDialMode | null | undefined,
  systemCampaignType: string | null | undefined,
): boolean {
  if (dialMode !== "PREDICTIVE" && dialMode !== "POWER_DIALER") return true;
  const sct = systemCampaignType?.trim() || null;
  if (sct === "rebooking") {
    return isLeadInRebookingDialerPool({
      status: l.status,
      meetingOutcomeStatus: l.meetingOutcomeStatus ?? null,
    });
  }
  if (l.status !== "NEW") return false;
  if (l.callbackReservedByUserId) return false;
  if (l.callbackScheduledFor) return false;
  return true;
}

export type QueueOrderFields = {
  status: string;
  importedAt: string;
  lastOutcomeAt?: string;
  /**
   * Seneste outbound dial-forsøg uanset om der blev gemt et udfald — bruges
   * sammen med lastOutcomeAt så leads vi har ringet til, men ikke fået svar fra
   * (no_answer / originate_failed / timeout / busy), ikke loops til toppen.
   */
  lastDialAttemptAt?: string;
  /**
   * Tidligere usvarede forsøg (voicemail / ikke hjemme). Fallback når
   * lastOutcomeAt mangler, så genåbnede leads ikke ser «jomfruelige» ud.
   */
  unansweredAttempts?: number;
  id: string;
  hasOutcomeLogToday?: boolean;
};

function touchedAtMs(row: QueueOrderFields): number {
  const oa = row.lastOutcomeAt ? new Date(row.lastOutcomeAt).getTime() : Number.NaN;
  const da = row.lastDialAttemptAt ? new Date(row.lastDialAttemptAt).getTime() : Number.NaN;
  const oaFinite = Number.isFinite(oa);
  const daFinite = Number.isFinite(da);
  if (oaFinite && daFinite) return oa > da ? oa : da;
  if (oaFinite) return oa;
  if (daFinite) return da;
  return Number.NaN;
}

function hasBeenTried(row: QueueOrderFields): boolean {
  if (Number.isFinite(touchedAtMs(row))) return true;
  return (row.unansweredAttempts ?? 0) > 0;
}

/**
 * Fælles sortering på tværs af Click-to-call, pulje, Power og Predictive:
 * status-rang → ikke kontaktet i dag først → aldrig forsøgt først → ældst touch
 * først → senest importeret → id.
 *
 * Voicemail / ikke-hjemme der er genåbnet efter cooldown skal kunne ringes
 * igen, men ligger bagerst til alle endnu-ikke-kontaktede i dag er taget.
 */
export function compareLeadQueueOrder(a: QueueOrderFields, b: QueueOrderFields): number {
  const ra = queueRank(a.status);
  const rb = queueRank(b.status);
  if (ra !== rb) return ra - rb;
  const ha = a.hasOutcomeLogToday === true ? 1 : 0;
  const hb = b.hasOutcomeLogToday === true ? 1 : 0;
  if (ha !== hb) return ha - hb;
  const aTried = hasBeenTried(a) ? 1 : 0;
  const bTried = hasBeenTried(b) ? 1 : 0;
  if (aTried !== bTried) return aTried - bTried;
  const tA = touchedAtMs(a);
  const tB = touchedAtMs(b);
  if (Number.isFinite(tA) && Number.isFinite(tB) && tA !== tB) return tA - tB;
  const ta = new Date(a.importedAt).getTime();
  const tb = new Date(b.importedAt).getTime();
  if (ta !== tb) return tb - ta;
  return a.id.localeCompare(b.id);
}

export function sortLeadsForQueue<T extends QueueOrderFields>(leads: T[]): T[] {
  return [...leads].sort(compareLeadQueueOrder);
}

/**
 * Opkaldskø på kampagne-arbejde: samme compareLeadQueueOrder som reserve-next /
 * Power / Predictive. Ikke-kontaktede i dag først; voicemail-genbrug bagerst.
 */
export function sortLeadsForCampaignCallQueue<T extends QueueOrderFields & { hasOutcomeLogToday: boolean }>(
  leads: T[],
): T[] {
  return [...leads].sort(compareLeadQueueOrder);
}
