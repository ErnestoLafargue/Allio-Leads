export const LEAD_STATUSES = [
  "NEW",
  "VOICEMAIL",
  "MEETING_BOOKED",
  "NOT_INTERESTED",
  "UNQUALIFIED",
  "NOT_HOME",
  "CALLBACK_SCHEDULED",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Ny",
  VOICEMAIL: "Voicemail",
  MEETING_BOOKED: "Møde booket",
  NOT_INTERESTED: "Ikke interesseret",
  UNQUALIFIED: "Ukvalificeret",
  NOT_HOME: "Ikke hjemme",
  CALLBACK_SCHEDULED: "Callback planlagt",
};

export function isLeadStatus(v: string): v is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(v);
}

/** Rækkefølge til oversigt «udlæg pr. udfald» (fx kampagne-layout for admin) */
export const LEAD_STATUS_STATS_ORDER: LeadStatus[] = [
  "NEW",
  "VOICEMAIL",
  "CALLBACK_SCHEDULED",
  "MEETING_BOOKED",
  "NOT_HOME",
  "NOT_INTERESTED",
  "UNQUALIFIED",
];

/** Små tæller-badges der matcher udfalds-knappernes farver */
export const LEAD_STATUS_COUNT_BADGE_CLASS: Record<LeadStatus, string> = {
  NEW: "border border-stone-400 bg-stone-200 text-stone-900",
  VOICEMAIL: "border border-amber-500 bg-amber-200 text-amber-950",
  MEETING_BOOKED: "border border-emerald-600 bg-emerald-200 text-emerald-950",
  NOT_INTERESTED: "border border-red-600 bg-red-200 text-red-950",
  UNQUALIFIED: "border border-red-600 bg-red-200 text-red-950",
  NOT_HOME: "border border-blue-600 bg-blue-200 text-blue-950",
  CALLBACK_SCHEDULED: "border border-violet-600 bg-violet-200 text-violet-950",
};
