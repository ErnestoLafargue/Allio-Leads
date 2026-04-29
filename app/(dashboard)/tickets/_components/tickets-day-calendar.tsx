"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TICKET_PRIORITY_LABELS,
} from "@/lib/ticket-priority";
import { calculateUrgency, sortTicketsByUrgency } from "@/lib/ticket-urgency";
import { isActiveTicketStatus } from "@/lib/ticket-status";
import { TicketPriorityBadge } from "./ticket-priority-badge";
import { TicketStatusBadge } from "./ticket-status-badge";
import { TicketDeadlineLabel } from "./ticket-deadline-label";
import type { AssignableUser, TicketDto } from "./tickets-shared";

type Props = {
  tickets: TicketDto[];
  /** Den bruger hvis dag vi ser. */
  selectedUserId: string;
  onSelectedUserIdChange: (id: string) => void;
  selectedDayKey: string;
  onSelectedDayKeyChange: (dayKey: string) => void;
  assignees: AssignableUser[];
  viewerId: string;
  onOpenTicket: (id: string) => void;
};

const DAY_HEADER_FORMATTER = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayKeyToDisplay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return DAY_HEADER_FORMATTER.format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  const dt = new Date(ms);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function dayKeyToEndOfDayUtc(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 22, 59, 59));
}

export function TicketsDayCalendar({
  tickets,
  selectedUserId,
  onSelectedUserIdChange,
  selectedDayKey,
  onSelectedDayKeyChange,
  assignees,
  viewerId,
  onOpenTicket,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  const [showNoDeadline, setShowNoDeadline] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const today = todayKey();

  const { overdue, active, noDeadline, doneCount } = useMemo(() => {
    const myTickets = tickets.filter((t) => t.assignedUser.id === selectedUserId);

    const overdue: TicketDto[] = [];
    const active: TicketDto[] = [];
    const noDeadline: TicketDto[] = [];
    let doneCount = 0;

    for (const t of myTickets) {
      if (t.status === "done") {
        doneCount += 1;
        continue;
      }
      if (!t.deadline) {
        noDeadline.push(t);
        continue;
      }
      // Overdue: deadline før i dag (uanset valgt dag)
      if (t.deadline < today) {
        overdue.push(t);
        continue;
      }
      // Active: vises hvis deadline matcher den valgte dag
      if (t.deadline === selectedDayKey) {
        active.push(t);
      }
    }

    const sortedActive = sortTicketsByUrgency(
      active.map((t) => ({
        ...t,
        deadline: t.deadline ? dayKeyToEndOfDayUtc(t.deadline) : null,
      })),
      now,
    ).map((t) => myTickets.find((m) => m.id === t.id)!).filter(Boolean);

    const sortedOverdue = sortTicketsByUrgency(
      overdue.map((t) => ({
        ...t,
        deadline: t.deadline ? dayKeyToEndOfDayUtc(t.deadline) : null,
      })),
      now,
    ).map((t) => myTickets.find((m) => m.id === t.id)!).filter(Boolean);

    return { overdue: sortedOverdue, active: sortedActive, noDeadline, doneCount };
  }, [tickets, selectedUserId, selectedDayKey, today, now]);

  const isViewerSelected = selectedUserId === viewerId;
  const selectedUser = assignees.find((u) => u.id === selectedUserId);
  const selectedDayLabel = selectedDayKey === today ? "I dag" : dayKeyToDisplay(selectedDayKey);

  return (
    <section className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      <header className="flex flex-col gap-2 border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-900">Dagskalender</h2>
          <button
            type="button"
            onClick={() => onSelectedDayKeyChange(today)}
            disabled={selectedDayKey === today}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            I dag
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectedDayKeyChange(shiftDayKey(selectedDayKey, -1))}
            aria-label="Forrige dag"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 transition hover:bg-stone-50"
          >
            ‹
          </button>
          <input
            type="date"
            value={selectedDayKey}
            onChange={(e) => onSelectedDayKeyChange(e.target.value)}
            className="flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-800 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2"
          />
          <button
            type="button"
            onClick={() => onSelectedDayKeyChange(shiftDayKey(selectedDayKey, 1))}
            aria-label="Næste dag"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 transition hover:bg-stone-50"
          >
            ›
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
            Bruger
          </span>
          <select
            value={selectedUserId}
            onChange={(e) => onSelectedUserIdChange(e.target.value)}
            className="flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2"
          >
            {assignees.length === 0 ? (
              <option value="">{selectedUser?.name ?? ""}</option>
            ) : (
              assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.id === viewerId ? " (mig)" : ""}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            {isViewerSelected ? "Min dag" : `${selectedUser?.name ?? "Bruger"}'s dag`}
          </p>
          <p className="mt-0.5 text-base font-semibold text-stone-900 first-letter:uppercase">
            {selectedDayLabel}
          </p>
        </div>

        {overdue.length > 0 ? (
          <Section
            label="Deadline overskredet"
            tone="danger"
            count={overdue.length}
          >
            {overdue.map((t) => (
              <TicketCard key={t.id} ticket={t} now={now} onOpen={onOpenTicket} />
            ))}
          </Section>
        ) : null}

        <Section label="Aktive opgaver" tone="default" count={active.length}>
          {active.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-xs text-stone-500">
              Ingen aktive tickets med deadline {selectedDayKey === today ? "i dag" : "den valgte dag"}.
            </p>
          ) : (
            active.map((t) => (
              <TicketCard key={t.id} ticket={t} now={now} onOpen={onOpenTicket} />
            ))
          )}
        </Section>

        {noDeadline.length > 0 ? (
          <details
            open={showNoDeadline}
            onToggle={(e) => setShowNoDeadline((e.target as HTMLDetailsElement).open)}
            className="mt-4 rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2"
          >
            <summary className="cursor-pointer list-none text-xs font-medium text-stone-600">
              <span className="inline-flex items-center gap-1">
                <span>{showNoDeadline ? "▾" : "▸"}</span>
                Uden deadline ({noDeadline.length})
              </span>
            </summary>
            <div className="mt-2 space-y-1.5">
              {noDeadline.map((t) => (
                <TicketCard key={t.id} ticket={t} now={now} onOpen={onOpenTicket} />
              ))}
            </div>
          </details>
        ) : null}

        {doneCount > 0 ? (
          <p className="mt-4 text-[11px] text-stone-500">
            {doneCount} færdig{doneCount === 1 ? "" : "e"} ticket{doneCount === 1 ? "" : "s"} skjult — synlige via filter «Færdig» i listen.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Section({
  label,
  tone,
  count,
  children,
}: {
  label: string;
  tone: "danger" | "default";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <h3
          className={[
            "text-[11px] font-semibold uppercase tracking-wide",
            tone === "danger" ? "text-red-700" : "text-stone-600",
          ].join(" ")}
        >
          {label}
        </h3>
        <span className="text-[11px] font-medium text-stone-400">{count}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function TicketCard({
  ticket,
  now,
  onOpen,
}: {
  ticket: TicketDto;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const urgency = calculateUrgency(
    {
      priority: ticket.priority,
      status: ticket.status,
      deadline: ticket.deadline ? dayKeyToEndOfDayUtc(ticket.deadline) : null,
    },
    now,
  );
  const overdue = ticket.deadline ? ticket.deadline < todayKey() : false;
  const inactive = !isActiveTicketStatus(ticket.status);

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className={[
        "block w-full rounded-lg border px-3 py-2 text-left transition",
        overdue
          ? "border-red-200 bg-red-50 hover:bg-red-100"
          : "border-stone-200 bg-white hover:bg-stone-50",
        inactive ? "opacity-60" : "",
      ].join(" ")}
      title={`Urgency: ${urgency.toFixed(0)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium text-stone-900">{ticket.title}</span>
        <TicketPriorityBadge priority={ticket.priority} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-stone-500">{ticket.assignedUser.name}</span>
        <span className="text-stone-300" aria-hidden>·</span>
        <TicketDeadlineLabel deadline={ticket.deadline} />
        <span className="text-stone-300" aria-hidden>·</span>
        <TicketStatusBadge status={ticket.status} />
      </div>
      <span className="sr-only">Åbn ticket med prioritet {TICKET_PRIORITY_LABELS[ticket.priority]}</span>
    </button>
  );
}
