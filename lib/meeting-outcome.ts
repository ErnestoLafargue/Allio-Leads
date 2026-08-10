export const MEETING_OUTCOME_PENDING = "PENDING";
export const MEETING_OUTCOME_HELD = "HELD";
export const MEETING_OUTCOME_CANCELLED = "CANCELLED";
export const MEETING_OUTCOME_REBOOK = "REBOOK";
/** Salg — flytter lead til «Aktive kunder» (kun admin). */
export const MEETING_OUTCOME_SALE = "SALE";
/** Tabt — mødet tabt (Podio eller admin). */
export const MEETING_OUTCOME_LOST = "LOST";
/** Under behandling — aftale/opfølgning i gang (kun admin). */
export const MEETING_OUTCOME_IN_PROGRESS = "IN_PROGRESS";

const SET = new Set([
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_IN_PROGRESS,
]);

export function normalizeMeetingOutcomeStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toUpperCase();
  return SET.has(s) ? s : MEETING_OUTCOME_PENDING;
}

export function isAdminMeetingOutcomeStatus(s: string): boolean {
  return (
    s === MEETING_OUTCOME_HELD ||
    s === MEETING_OUTCOME_CANCELLED ||
    s === MEETING_OUTCOME_REBOOK ||
    s === MEETING_OUTCOME_PENDING ||
    s === MEETING_OUTCOME_SALE ||
    s === MEETING_OUTCOME_LOST ||
    s === MEETING_OUTCOME_IN_PROGRESS
  );
}

export const MEETING_OUTCOME_LABELS: Record<string, string> = {
  [MEETING_OUTCOME_PENDING]: "Afventende",
  [MEETING_OUTCOME_HELD]: "Afholdt",
  [MEETING_OUTCOME_CANCELLED]: "Ej mødt",
  [MEETING_OUTCOME_REBOOK]: "Genbooking",
  [MEETING_OUTCOME_SALE]: "Salg",
  [MEETING_OUTCOME_LOST]: "Tabt",
  [MEETING_OUTCOME_IN_PROGRESS]: "Under behandling",
};

export function meetingOutcomeBadgeClass(raw: string | null | undefined): string {
  const s = normalizeMeetingOutcomeStatus(raw);
  if (s === MEETING_OUTCOME_HELD) return "bg-emerald-100 text-emerald-900";
  if (s === MEETING_OUTCOME_CANCELLED) return "bg-red-100 text-red-800";
  if (s === MEETING_OUTCOME_REBOOK) return "bg-red-100 text-red-800";
  if (s === MEETING_OUTCOME_SALE) return "bg-emerald-100 text-emerald-900";
  if (s === MEETING_OUTCOME_LOST) return "bg-red-600 text-white";
  if (s === MEETING_OUTCOME_IN_PROGRESS) return "bg-amber-100 text-amber-950";
  // PENDING — blå
  return "bg-blue-100 text-blue-950";
}
