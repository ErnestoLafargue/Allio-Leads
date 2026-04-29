"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [pendingId, setPendingId] = useState<string | null>(null);

  const today = todayKey();

  const loadQueue = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/tickets/daily-queue?userId=${encodeURIComponent(selectedUserId)}&date=${encodeURIComponent(selectedDayKey)}`,
          { signal },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Kunne ikke hente dagskø.");
          return;
        }
        setQueue((data.queue ?? []) as TicketDto[]);
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
        setError("Netværksfejl ved hentning af dagskø.");
      } finally {
        setLoading(false);
      }
    },
    [selectedUserId, selectedDayKey],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadQueue(ctrl.signal);
    return () => ctrl.abort();
  }, [loadQueue]);

  const isViewerSelected = selectedUserId === viewerId;
  const selectedUser = assignees.find((u) => u.id === selectedUserId);
  const selectedDayLabel = selectedDayKey === today ? "I dag" : dayKeyToDisplay(selectedDayKey);

  /**
   * Generic action: PATCH ticket → drop fra lokal queue → genhent kø så den fyldes op.
   */
  async function applyAction(ticket: TicketDto, payload: Record<string, unknown>, errorText: string) {
    setPendingId(ticket.id);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : errorText);
        setPendingId(null);
        return;
      }
      onTicketUpdated(data.ticket as TicketDto);
      // Optimistisk fjern fra liste, så UI'et reagerer øjeblikkeligt
      setQueue((prev) => prev.filter((t) => t.id !== ticket.id));
      // Genberegn dagskøen så lavere prioriteter fylder op igen
      await loadQueue();
    } finally {
      setPendingId(null);
    }
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
          <p className="mt-1 text-xs text-stone-500">
            Aktiv arbejdsliste — sættes til I gang, Afventer, Færdig eller udskydes til i morgen.
          </p>
        </div>

        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        {loading && queue.length === 0 ? (
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
                pending={pendingId === t.id}
                onOpen={onOpenTicket}
                onSnooze={(tk) =>
                  applyAction(tk, { hiddenFromDailyUntil: "tomorrow" }, "Kunne ikke udskyde ticket.")
                }
                onSetInProgress={(tk) =>
                  applyAction(tk, { status: "in_progress" }, "Kunne ikke sætte til I gang.")
                }
                onSetWaiting={(tk) =>
                  applyAction(tk, { status: "waiting" }, "Kunne ikke sætte til Afventer.")
                }
                onDone={(tk) =>
                  applyAction(tk, { status: "done" }, "Kunne ikke markere som færdig.")
                }
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
  pending,
  onOpen,
  onSnooze,
  onSetInProgress,
  onSetWaiting,
  onDone,
}: {
  ticket: TicketDto;
  pending: boolean;
  onOpen: (id: string) => void;
  onSnooze: (ticket: TicketDto) => void;
  onSetInProgress: (ticket: TicketDto) => void;
  onSetWaiting: (ticket: TicketDto) => void;
  onDone: (ticket: TicketDto) => void;
}) {
  const overdue = ticket.deadline ? ticket.deadline < todayKey() : false;

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(ticket.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(ticket.id);
        }
      }}
      className={[
        "block w-full cursor-pointer rounded-xl border px-3 py-3 text-left transition",
        overdue
          ? "border-red-200 bg-red-50/70 hover:bg-red-50"
          : "border-stone-200 bg-white hover:bg-stone-50",
        pending ? "opacity-60" : "",
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
      <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={stop}>
        <ActionButton
          tone="amber"
          disabled={pending}
          onClick={() => onSnooze(ticket)}
          label="Udskyd til i morgen"
        />
        <ActionButton
          tone="blue"
          disabled={pending || ticket.status === "in_progress"}
          onClick={() => onSetInProgress(ticket)}
          label="I gang"
        />
        <ActionButton
          tone="stone"
          disabled={pending || ticket.status === "waiting"}
          onClick={() => onSetWaiting(ticket)}
          label="Afventer"
        />
        <ActionButton
          tone="emerald"
          disabled={pending}
          onClick={() => onDone(ticket)}
          label="Færdig"
        />
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<"amber" | "blue" | "stone" | "emerald", string> = {
  amber: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
  blue: "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100",
  stone: "border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100",
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
};

function ActionButton({
  tone,
  disabled,
  onClick,
  label,
}: {
  tone: keyof typeof TONE_CLASSES;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "inline-flex h-7 items-center justify-center rounded-md border px-2.5 text-[11px] font-semibold leading-none whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50",
        TONE_CLASSES[tone],
      ].join(" ")}
    >
      {label}
    </button>
  );
}
