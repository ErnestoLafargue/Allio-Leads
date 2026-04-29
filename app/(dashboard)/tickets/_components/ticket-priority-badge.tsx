import {
  TICKET_PRIORITY_BADGE_CLASS,
  TICKET_PRIORITY_LABELS,
  type TicketPriority,
} from "@/lib/ticket-priority";

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        TICKET_PRIORITY_BADGE_CLASS[priority],
      ].join(" ")}
    >
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}
