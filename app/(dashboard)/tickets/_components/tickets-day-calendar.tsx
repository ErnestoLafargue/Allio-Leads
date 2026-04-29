"use client";

import { useEffect, useState } from "react";
import { TicketPriorityBadge } from "./ticket-priority-badge";
import { TicketStatusBadge } from "./ticket-status-badge";
import { TicketDeadlineLabel } from "./ticket-deadline-label";
import type { AssignableUser, TicketDto } from "./tickets-shared";

type Props = {
  selectedUserId: string;
  onSelectedUserIdChange: (id: string) => void;
  selectedDayKey: string;
  onSelectedDayKeyChange: (dayKey: string) => void;
  assignees: AssignableUser[];
  viewerId: string;
  onOpenTicket: (id: string) => void;
  onTicketUpdated: (ticket: TicketDto) => void;
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

export function TicketsDayCalendar({
  selectedUserId,
  onSelectedUserIdChange,
  selectedDayKey,
  onSelectedDayKeyChange,
  assignees,
  viewerId,
  onOpenTicket,
  onTicketUpdated,
}: Props) {
  const [queue, setQueue] = useState<TicketDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = todayKey();

  useEffect(() => {
    let cancelled = false;
    async function loadQueue() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/tickets/daily-queue?userId=${encodeURIComponent(selectedUserId)}&date=${encodeURIComponent(selectedDayKey)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setError(typeof data.error === "string" ? data.error : "Kunne ikke hente dagskø.");
          return;
        }
        if (!cancelled) setQueue((data.queue ?? []) as TicketDto[]);
      } catch {
        if (!cancelled) setError("Netværksfejl ved hentning af dagskø.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadQueue();
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, selectedDayKey]);

  const isViewerSelected = selectedUserId === viewerId;
  const selectedUser = assignees.find((u) => u.id === selectedUserId);
  const selectedDayLabel = selectedDayKey === today ? "I dag" : dayKeyToDisplay(selectedDayKey);

  async function snoozeToTomorrow(ticket: TicketDto) {
    const tomorrow = shiftDayKey(todayKey(), 1);
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snoozedUntil: tomorrow }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Kunne ikke udskyde ticket.");
      return;
    }
    onTicketUpdated(data.ticket as TicketDto);
    setQueue((prev) => prev.filter((t) => t.id !== ticket.id));
  }

  async function markDone(ticket: TicketDto) {
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Kunne ikke markere som færdig.");
      return;
    }
    onTicketUpdated(data.ticket as TicketDto);
    setQueue((prev) => prev.filter((t) => t.id !== ticket.id));
  }

  return (
    <section className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
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
          <p className="mt-1 text-xs text-stone-500">Her er de vigtigste tickets at arbejde på i dag.</p>
        </div>

        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        {loading ? (
          <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-4 text-sm text-stone-500">Henter dagskalender…</p>
        ) : queue.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">
            Ingen aktive tickets for i dag
          </p>
        ) : (
          <div className="space-y-2.5">
            {queue.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                onOpen={onOpenTicket}
                onSnooze={snoozeToTomorrow}
                onDone={markDone}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TicketCard({
  ticket,
  onOpen,
  onSnooze,
  onDone,
}: {
  ticket: TicketDto;
  onOpen: (id: string) => void;
  onSnooze: (ticket: TicketDto) => void;
  onDone: (ticket: TicketDto) => void;
}) {
  const overdue = ticket.deadline ? ticket.deadline < todayKey() : false;

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className={[
        "block w-full rounded-xl border px-3 py-3 text-left transition",
        overdue
          ? "border-red-200 bg-red-50/70 hover:bg-red-50"
          : "border-stone-200 bg-white hover:bg-stone-50",
      ].join(" ")}
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
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDone(ticket);
          }}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
        >
          Marker som færdig
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSnooze(ticket);
          }}
          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"
        >
          Udskyd til i morgen
        </button>
      </div>
    </button>
  );
}
