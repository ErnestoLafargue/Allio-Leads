"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LIST_FILTERS,
  TicketsList,
  type TicketListFilters,
} from "./tickets-list";
import { TicketsDayCalendar } from "./tickets-day-calendar";
import { TicketSidePanel, type TicketSidePanelMode } from "./ticket-side-panel";
import type { AssignableUser, TicketDto, TicketsViewer } from "./tickets-shared";

type Props = {
  viewer: TicketsViewer;
};

function todayDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function TicketsWorkspace({ viewer }: Props) {
  const [tickets, setTickets] = useState<TicketDto[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<TicketListFilters>(DEFAULT_LIST_FILTERS);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<TicketSidePanelMode>("create");
  const [panelTicketId, setPanelTicketId] = useState<string | null>(null);

  const [calendarUserId, setCalendarUserId] = useState<string>(viewer.id);
  const [calendarDayKey, setCalendarDayKey] = useState<string>(() => todayDayKey());

  const panelTicket = useMemo(
    () => (panelTicketId ? tickets.find((t) => t.id === panelTicketId) ?? null : null),
    [panelTicketId, tickets],
  );

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Vi henter altid alle tickets — filtrering for "Mine tickets" sker klient-side
      // så dagskalenderen kan vise alle assignees uden ekstra request.
      const res = await fetch("/api/tickets?scope=all");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Kunne ikke hente tickets.");
        setTickets([]);
        return;
      }
      const data = (await res.json()) as { tickets: TicketDto[] };
      setTickets(data.tickets ?? []);
    } catch (err) {
      console.error(err);
      setError("Netværksfejl. Prøv igen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    let cancelled = false;
    async function loadAssignees() {
      const res = await fetch("/api/users/for-tickets");
      if (!res.ok) return;
      const data = (await res.json()) as { users: AssignableUser[] };
      if (!cancelled) setAssignees(data.users ?? []);
    }
    void loadAssignees();
    return () => {
      cancelled = true;
    };
  }, []);

  // Klient-side scope: tickets jeg er tildelt eller har oprettet.
  const ticketsForList = useMemo(() => {
    if (filters.scope === "all") return tickets;
    return tickets.filter(
      (t) => t.assignedUser.id === viewer.id || t.createdBy.id === viewer.id,
    );
  }, [tickets, filters.scope, viewer.id]);

  function handleOpenCreate() {
    setPanelTicketId(null);
    setPanelMode("create");
    setPanelOpen(true);
  }

  function handleOpenTicket(id: string) {
    setPanelTicketId(id);
    setPanelMode("view");
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
  }

  function handleSaved(saved: TicketDto) {
    setTickets((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      if (exists) return prev.map((t) => (t.id === saved.id ? saved : t));
      return [saved, ...prev];
    });
    setPanelTicketId(saved.id);
    setPanelMode("view");
    setPanelOpen(true);
  }

  function handleDeleted(id: string) {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setPanelOpen(false);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Tickets</h1>
          <p className="mt-1 text-sm text-stone-600">
            Internt opgavestyringssystem — opret, tildel og prioritér interne tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Opret ticket
        </button>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TicketsList
          tickets={ticketsForList}
          filters={filters}
          onFiltersChange={setFilters}
          assignees={assignees}
          loading={loading}
          onOpenTicket={handleOpenTicket}
        />
        <TicketsDayCalendar
          tickets={tickets}
          selectedUserId={calendarUserId}
          onSelectedUserIdChange={setCalendarUserId}
          selectedDayKey={calendarDayKey}
          onSelectedDayKeyChange={setCalendarDayKey}
          assignees={assignees}
          viewerId={viewer.id}
          onOpenTicket={handleOpenTicket}
        />
      </div>

      <TicketSidePanel
        open={panelOpen}
        mode={panelMode}
        ticket={panelTicket}
        viewer={viewer}
        assignees={assignees}
        defaultAssigneeId={viewer.id}
        onClose={handleClose}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        onModeChange={setPanelMode}
      />
    </div>
  );
}
