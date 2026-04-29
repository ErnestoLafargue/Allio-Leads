import {
  TICKET_STATUS_BADGE_CLASS,
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from "@/lib/ticket-status";

const BASE =
  "inline-flex h-6 items-center justify-center rounded-md px-2.5 text-[11px] font-semibold leading-none whitespace-nowrap";

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={[BASE, TICKET_STATUS_BADGE_CLASS[status]].join(" ")}>
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}
