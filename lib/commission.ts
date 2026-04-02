import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";

/** Provisions-sats pr. afholdt møde ud fra antal afholdte møder samme bookings-dag (efter alle udfald). */
export function rateKrPerHeldMeeting(heldCount: number): number {
  if (heldCount <= 0) return 0;
  if (heldCount === 1) return 200;
  if (heldCount === 2) return 250;
  return 300;
}

export type MeetingForCommission = {
  meetingOutcomeStatus: string;
};

/**
 * Provision for én bookings-dag: alle møder skal have udfald (HELD/CANCELLED).
 * Trappesatsen afhænger kun af antal AFHOLDTE møder den dag.
 */
export function commissionKrForBookedDay(meetings: MeetingForCommission[]): {
  finalized: boolean;
  heldCount: number;
  cancelledCount: number;
  pendingCount: number;
  kr: number;
  ratePerHeld: number;
} {
  const pending = meetings.filter((m) => normalizeOutcome(m.meetingOutcomeStatus) === MEETING_OUTCOME_PENDING);
  const held = meetings.filter((m) => {
    const o = normalizeOutcome(m.meetingOutcomeStatus);
    return o === MEETING_OUTCOME_HELD || o === MEETING_OUTCOME_SALE;
  });
  const cancelled = meetings.filter(
    (m) => normalizeOutcome(m.meetingOutcomeStatus) === MEETING_OUTCOME_CANCELLED,
  );

  if (pending.length > 0) {
    return {
      finalized: false,
      heldCount: held.length,
      cancelledCount: cancelled.length,
      pendingCount: pending.length,
      kr: 0,
      ratePerHeld: 0,
    };
  }

  const h = held.length;
  const ratePerHeld = rateKrPerHeldMeeting(h);
  return {
    finalized: true,
    heldCount: h,
    cancelledCount: cancelled.length,
    pendingCount: 0,
    kr: h * ratePerHeld,
    ratePerHeld,
  };
}

function normalizeOutcome(s: string): string {
  return String(s ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
}
