import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";

/** Statusser hvor Tilbagekald kan planlægges — inkl. rettelse af forkert udfald. */
const SCHEDULABLE_STATUSES = new Set([
  "NEW",
  "VOICEMAIL",
  "NOT_HOME",
  "NOT_INTERESTED",
  "UNQUALIFIED",
  "CALLBACK_SCHEDULED",
]);

/** Afsluttede / genbookede møder — tillad tilbagekald så man kan støde på leadet igen (Mine salg, genbook m.m.). */
const MEETING_REENGAGE_OUTCOMES = new Set([
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_SALE,
]);

export type CallbackScheduleLeadFields = {
  status: string;
  callbackStatus?: string | null;
  /** Bruges ved MEETING_BOOKED — PENDING/IN_PROGRESS blokerer stadig. */
  meetingOutcomeStatus?: string | null;
};

export function canScheduleCallbackFromLead(lead: CallbackScheduleLeadFields): boolean {
  const status = String(lead.status ?? "").trim().toUpperCase();
  if (status === "MEETING_BOOKED") {
    return MEETING_REENGAGE_OUTCOMES.has(
      normalizeMeetingOutcomeStatus(lead.meetingOutcomeStatus),
    );
  }
  if (!SCHEDULABLE_STATUSES.has(status)) return false;
  if (status === "CALLBACK_SCHEDULED") {
    return String(lead.callbackStatus ?? "PENDING").trim().toUpperCase() === "PENDING";
  }
  return true;
}
