import {
  TICKET_STATUS_BADGE_CLASS,
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from "@/lib/ticket-status";

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        TICKET_STATUS_BADGE_CLASS[status],
      ].join(" ")}
    >
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}
