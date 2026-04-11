import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";

/** Genbooking-kampagne: fast provision pr. afholdt møde (uden bonustrappe). */
export const COMMISSION_REBOOKING_FLAT_KR = 100;

/** Provisions-sats pr. afholdt møde ud fra antal afholdte møder samme bookings-dag (efter alle udfald). Kun ikke-genbooking møder tæller i antallet. */
export function rateKrPerHeldMeeting(heldCount: number): number {
  if (heldCount <= 0) return 0;
  if (heldCount === 1) return 200;
  if (heldCount === 2) return 250;
  return 300;
}

export type MeetingForCommission = {
  meetingOutcomeStatus: string;
  bookedFromRebookingCampaign?: boolean | null;
};

function normalizeOutcome(s: string): string {
  return String(s ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
}

function isHeldOutcome(o: string): boolean {
  const n = normalizeOutcome(o);
  return n === MEETING_OUTCOME_HELD || n === MEETING_OUTCOME_SALE;
}

function isRebookingSource(m: MeetingForCommission): boolean {
  return m.bookedFromRebookingCampaign === true;
}

/**
 * Provision for én bookings-dag.
 * Genbooking-bookede møder: fast {@link COMMISSION_REBOOKING_FLAT_KR} kr pr. afholdt — tæller ikke med i bonustrappens antal.
 * Øvrige møder: trappesats ud fra antal afholdte ikke-genbooking møder samme dag.
 */
export function commissionKrForBookedDay(meetings: MeetingForCommission[]): {
  finalized: boolean;
  heldCount: number;
  heldRebookingCount: number;
  heldStandardCount: number;
  cancelledCount: number;
  pendingCount: number;
  kr: number;
  /** Bonustrappens sats for standard-afholdte (0 hvis ingen). */
  ratePerHeldStandard: number;
} {
  const pending = meetings.filter(
    (m) => normalizeOutcome(m.meetingOutcomeStatus) === MEETING_OUTCOME_PENDING,
  );
  const held = meetings.filter((m) => isHeldOutcome(m.meetingOutcomeStatus));
  const cancelled = meetings.filter(
    (m) => normalizeOutcome(m.meetingOutcomeStatus) === MEETING_OUTCOME_CANCELLED,
  );

  const heldRebooking = held.filter(isRebookingSource);
  const heldStandard = held.filter((m) => !isRebookingSource(m));
  const hStd = heldStandard.length;
  const ratePerHeldStandard = rateKrPerHeldMeeting(hStd);
  const kr =
    heldRebooking.length * COMMISSION_REBOOKING_FLAT_KR + heldStandard.length * ratePerHeldStandard;

  return {
    finalized: pending.length === 0,
    heldCount: held.length,
    heldRebookingCount: heldRebooking.length,
    heldStandardCount: heldStandard.length,
    cancelledCount: cancelled.length,
    pendingCount: pending.length,
    kr,
    ratePerHeldStandard,
  };
}

/** Ikke-annullerede møder (kan stadig blive afholdt). */
export function forventetProvisionKrForBookedDay(meetings: MeetingForCommission[]): number {
  const possible = meetings.filter(
    (m) => normalizeOutcome(m.meetingOutcomeStatus) !== MEETING_OUTCOME_CANCELLED,
  );
  const possibleRebooking = possible.filter(isRebookingSource);
  const possibleStandard = possible.filter((m) => !isRebookingSource(m));
  const nStd = possibleStandard.length;
  return (
    possibleRebooking.length * COMMISSION_REBOOKING_FLAT_KR +
    possibleStandard.length * rateKrPerHeldMeeting(nStd)
  );
}
