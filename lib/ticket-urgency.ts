import { TICKET_PRIORITY_SCORE, type TicketPriority } from "@/lib/ticket-priority";
import type { TicketStatus } from "@/lib/ticket-status";

export type TicketUrgencyInput = {
  priority: TicketPriority | string;
  status: TicketStatus | string;
  deadline: Date | null;
};

const HOURS_MS = 3_600_000;

/**
 * Beregner urgency-score for en ticket. Højere score = højere placering i dagskalenderen.
 *
 * Regelsæt (jf. spec):
 *   1. Færdig (`done`) → −999 (kommer aldrig højt op)
 *   2. Overskredet deadline → 1000 + |timer overskredet| (alle overskredne ligger over alt andet)
 *   3. Aktiv ticket m. deadline → basePriority + max(0, 120 − timer_til_deadline)
 *   4. Aktiv ticket uden deadline → basePriority − 20 (fast straf for manglende deadline)
 *
 * Bemærk: en lav prioritet med kort deadline kan ende over en høj prioritet
 * med lang deadline — det er bevidst og matcher brugerens specifikation.
 */
export function calculateUrgency(ticket: TicketUrgencyInput, now: Date = new Date()): number {
  if (ticket.status === "done") return -999;

  const base = TICKET_PRIORITY_SCORE[ticket.priority as TicketPriority] ?? 0;

  if (!ticket.deadline) {
    return base - 20;
  }

  const hoursUntilDeadline = (ticket.deadline.getTime() - now.getTime()) / HOURS_MS;

  if (hoursUntilDeadline < 0) {
    return 1000 + Math.abs(hoursUntilDeadline);
  }

  const deadlinePressure = Math.max(0, 120 - hoursUntilDeadline);
  return base + deadlinePressure;
}

/**
 * Returnerer en ny array sorteret efter urgency (højeste først).
 * Stabil sortering: ved lige scores bevares oprindelig rækkefølge.
 */
export function sortTicketsByUrgency<T extends TicketUrgencyInput>(
  tickets: readonly T[],
  now: Date = new Date(),
): T[] {
  return tickets
    .map((t, idx) => ({ t, idx, score: calculateUrgency(t, now) }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    .map((entry) => entry.t);
}

/** Hjælper til UI: er deadline overskredet? */
export function isDeadlineOverdue(deadline: Date | null, now: Date = new Date()): boolean {
  return !!deadline && deadline.getTime() < now.getTime();
}

/** Hjælper til UI: er deadline inden for de næste 24 timer? */
export function isDeadlineSoon(deadline: Date | null, now: Date = new Date()): boolean {
  if (!deadline) return false;
  const diff = deadline.getTime() - now.getTime();
  return diff >= 0 && diff <= 24 * HOURS_MS;
}
