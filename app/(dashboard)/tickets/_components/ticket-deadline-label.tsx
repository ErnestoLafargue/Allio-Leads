"use client";

import { useEffect, useState } from "react";
import { isDeadlineOverdue, isDeadlineSoon } from "@/lib/ticket-urgency";

type Props = {
  /** YYYY-MM-DD eller null. */
  deadline: string | null;
  className?: string;
};

const DAY_FORMATTER = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const SHORT_FORMATTER = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "2-digit", month: "short" });

function dayKeyToEndOfDayUtc(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 22, 59, 59));
}

/**
 * Pille der viser ticket-deadline med farve:
 *   - overskredet → rød pille "Deadline overskredet"
 *   - ≤24t → orange pille "Deadline nærmer sig"
 *   - >24t → neutral pille med datoen
 *   - null → grå pille "Ingen deadline"
 */
export function TicketDeadlineLabel({ deadline, className }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const base = "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium";

  if (!deadline) {
    return (
      <span className={[base, "bg-stone-100 text-stone-600", className ?? ""].join(" ")}>Ingen deadline</span>
    );
  }

  const date = dayKeyToEndOfDayUtc(deadline);

  if (isDeadlineOverdue(date, now)) {
    return (
      <span className={[base, "bg-red-100 text-red-800", className ?? ""].join(" ")}>
        Deadline overskredet · {SHORT_FORMATTER.format(date)}
      </span>
    );
  }
  if (isDeadlineSoon(date, now)) {
    return (
      <span className={[base, "bg-orange-100 text-orange-800", className ?? ""].join(" ")}>
        Deadline nærmer sig · {SHORT_FORMATTER.format(date)}
      </span>
    );
  }
  return (
    <span className={[base, "bg-stone-100 text-stone-700", className ?? ""].join(" ")}>
      {DAY_FORMATTER.format(date)}
    </span>
  );
}
