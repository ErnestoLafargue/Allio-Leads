export const LEAD_ACTIVITY_KIND = {
  NOTE_UPDATE: "NOTE_UPDATE",
  /** Afspilningsbar optagelse fra Telnyx el.l. */
  CALL_RECORDING: "CALL_RECORDING",
  /** Opkald forsøgt (succes/fejl) — ikke nødvendigvis gennemført samtale */
  CALL_ATTEMPT: "CALL_ATTEMPT",
  /** Leadets udfald-status efter gem (kun én linje pr. gem — den lagrede værdi) */
  OUTCOME_SET: "OUTCOME_SET",
  /** Callback-plan gemt: ny reservation eller ny tid (én linje pr. gem) */
  CALLBACK_SCHEDULE: "CALLBACK_SCHEDULE",
} as const;

export type LeadActivityKind = (typeof LEAD_ACTIVITY_KIND)[keyof typeof LEAD_ACTIVITY_KIND];

/** Kort maskering af nummer i aktivitetsliste */
export function maskPhoneForActivity(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length <= 4) return "••••";
  return `•••• ${d.slice(-4)}`;
}
