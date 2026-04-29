import {
  TICKET_PRIORITY_BADGE_CLASS,
  TICKET_PRIORITY_LABELS,
  type TicketPriority,
} from "@/lib/ticket-priority";

const BASE =
  "inline-flex h-6 items-center justify-center rounded-md px-2.5 text-[11px] font-semibold leading-none whitespace-nowrap";

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={[BASE, TICKET_PRIORITY_BADGE_CLASS[priority]].join(" ")}>
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}
