export const MEETING_OUTCOME_PENDING = "PENDING";
export const MEETING_OUTCOME_HELD = "HELD";
export const MEETING_OUTCOME_CANCELLED = "CANCELLED";
/** Salg — flytter lead til «Aktive kunder» (kun admin). */
export const MEETING_OUTCOME_SALE = "SALE";

const SET = new Set([
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_SALE,
]);

export function normalizeMeetingOutcomeStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toUpperCase();
  return SET.has(s) ? s : MEETING_OUTCOME_PENDING;
}

export function isAdminMeetingOutcomeStatus(s: string): boolean {
  return (
    s === MEETING_OUTCOME_HELD ||
    s === MEETING_OUTCOME_CANCELLED ||
    s === MEETING_OUTCOME_PENDING ||
    s === MEETING_OUTCOME_SALE
  );
}

export const MEETING_OUTCOME_LABELS: Record<string, string> = {
  [MEETING_OUTCOME_PENDING]: "Afventende",
  [MEETING_OUTCOME_HELD]: "Afholdt",
  [MEETING_OUTCOME_CANCELLED]: "Annulleret",
  [MEETING_OUTCOME_SALE]: "Salg",
};
