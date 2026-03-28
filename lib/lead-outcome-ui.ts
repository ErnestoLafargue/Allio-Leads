import { LEAD_STATUS_LABELS, type LeadStatus } from "./lead-status";

/** Samme rækkefølge som på kampagne-arbejdsfladen */
export const OUTCOME_ORDER: LeadStatus[] = [
  "NEW",
  "VOICEMAIL",
  "NOT_INTERESTED",
  "MEETING_BOOKED",
  "NOT_HOME",
];

export function outcomeButtonClass(status: LeadStatus, active: boolean): string {
  const base =
    "rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-w-[8rem] flex-1 sm:flex-none";
  if (!active) {
    return `${base} border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50`;
  }
  switch (status) {
    case "NEW":
      return `${base} border-stone-500 bg-stone-200 text-stone-900 ring-2 ring-stone-400`;
    case "VOICEMAIL":
      return `${base} border-amber-500 bg-amber-300 text-amber-950 ring-2 ring-amber-400`;
    case "NOT_INTERESTED":
      return `${base} border-red-600 bg-red-300 text-red-950 ring-2 ring-red-500`;
    case "MEETING_BOOKED":
      return `${base} border-emerald-600 bg-emerald-300 text-emerald-950 ring-2 ring-emerald-500`;
    case "NOT_HOME":
      return `${base} border-blue-600 bg-blue-300 text-blue-950 ring-2 ring-blue-500`;
    default:
      return `${base} border-stone-500 bg-stone-200`;
  }
}

export function outcomeLabel(s: LeadStatus): string {
  return LEAD_STATUS_LABELS[s];
}
