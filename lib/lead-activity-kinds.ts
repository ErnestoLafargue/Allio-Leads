export const LEAD_ACTIVITY_KIND = {
  NOTE_UPDATE: "NOTE_UPDATE",
  CALL_RECORDING: "CALL_RECORDING",
} as const;

export type LeadActivityKind = (typeof LEAD_ACTIVITY_KIND)[keyof typeof LEAD_ACTIVITY_KIND];
