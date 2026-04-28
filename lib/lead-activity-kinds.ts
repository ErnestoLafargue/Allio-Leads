import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

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
  /** Leaddetalje åbnet (liste, historik, møder, m.m.) — ikke kun arbejdskø */
  LEAD_DETAIL_OPEN: "LEAD_DETAIL_OPEN",
  /** Admin har ændret mødeudfald (afholdt, salg, …) */
  MEETING_OUTCOME_SET: "MEETING_OUTCOME_SET",
  /** Møde er tildelt/omfordelt til ansvarlig bruger */
  MEETING_ASSIGNEE_SET: "MEETING_ASSIGNEE_SET",
  /** System sendte SMS reminder for kommende møde */
  MEETING_REMINDER_SMS: "MEETING_REMINDER_SMS",
} as const;

export type LeadActivityKind = (typeof LEAD_ACTIVITY_KIND)[keyof typeof LEAD_ACTIVITY_KIND];

/**
 * Læsbart telefonnummer i aktivitetstekster.
 * Bruges kun bag login, hvor brugeren allerede har adgang til leadets telefonfelt.
 */
export function formatPhoneForActivitySummary(raw: string): string {
  const e164 = normalizePhoneToE164ForDial(raw);
  if (!e164) {
    const t = raw.trim();
    return t || "ukendt nummer";
  }
  const d = e164.replace(/\D/g, "");
  if (d.startsWith("45") && d.length === 10) {
    const rest = d.slice(2);
    return `+45 ${rest.slice(0, 2)} ${rest.slice(2, 4)} ${rest.slice(4, 6)} ${rest.slice(6, 8)}`;
  }
  return e164;
}
