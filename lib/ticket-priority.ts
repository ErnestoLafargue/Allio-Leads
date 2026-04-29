export const TICKET_PRIORITIES = [
  "haster",
  "snarest_muligt",
  "normal",
  "naar_tiden_passer",
] as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  haster: "Haster",
  snarest_muligt: "Snarest muligt",
  normal: "Normal",
  naar_tiden_passer: "Når tiden passer",
};

/** Rækkefølge til segmented control / dropdowns (mest haster først). */
export const TICKET_PRIORITY_ORDER: TicketPriority[] = [
  "haster",
  "snarest_muligt",
  "normal",
  "naar_tiden_passer",
];

/** Base score til urgency-beregningen — højere score = højere prioritet. */
export const TICKET_PRIORITY_SCORE: Record<TicketPriority, number> = {
  haster: 100,
  snarest_muligt: 70,
  normal: 40,
  naar_tiden_passer: 10,
};

/** Tailwind-klasser for prioritets-pille i lister og kort. */
export const TICKET_PRIORITY_BADGE_CLASS: Record<TicketPriority, string> = {
  haster: "bg-red-100 text-red-800",
  snarest_muligt: "bg-orange-100 text-orange-800",
  normal: "bg-blue-100 text-blue-800",
  naar_tiden_passer: "bg-stone-200 text-stone-700",
};

export function isTicketPriority(v: unknown): v is TicketPriority {
  return typeof v === "string" && (TICKET_PRIORITIES as readonly string[]).includes(v);
}

export function ticketPriorityLabel(v: string): string {
  return isTicketPriority(v) ? TICKET_PRIORITY_LABELS[v] : v;
}
