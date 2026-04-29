export const TICKET_STATUSES = ["open", "in_progress", "waiting", "done"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Åben",
  in_progress: "I gang",
  waiting: "Afventer",
  done: "Færdig",
};

/** Rækkefølge til filtre / dropdowns (åben → færdig). */
export const TICKET_STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "waiting", "done"];

/** Tailwind-klasser for status-pille. Holdes flade og ens-formede ift. prioritet/deadline. */
export const TICKET_STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  open: "bg-stone-200 text-stone-800",
  in_progress: "bg-blue-100 text-blue-800",
  waiting: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);
}

export function ticketStatusLabel(v: string): string {
  return isTicketStatus(v) ? TICKET_STATUS_LABELS[v] : v;
}

/** Færdige tickets skal ikke fylde i dagskalenderen. */
export function isActiveTicketStatus(v: string): boolean {
  return isTicketStatus(v) && v !== "done";
}
