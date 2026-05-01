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
  mode: "mine" | "all";
};

function todayDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function TicketsWorkspace({ viewer, mode }: Props) {
  const [tickets, setTickets] = useState<TicketDto[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<TicketListFilters>({
    ...DEFAULT_LIST_FILTERS,
    scope: mode === "mine" ? "mine" : "all",
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<TicketSidePanelMode>("create");
  const [panelTicketId, setPanelTicketId] = useState<string | null>(null);
  const [calendarReloadToken, setCalendarReloadToken] = useState(0);

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
    if (mode === "all" && filters.scope === "all") return tickets;
    return tickets.filter(
      (t) => t.assignedUser.id === viewer.id || t.createdBy.id === viewer.id,
    );
  }, [tickets, mode, filters.scope, viewer.id]);

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
    setCalendarReloadToken((n) => n + 1);
    setPanelTicketId(saved.id);
    setPanelMode("view");
    setPanelOpen(true);
  }

  function handleDeleted(id: string) {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setCalendarReloadToken((n) => n + 1);
    setPanelOpen(false);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            {mode === "mine" ? "Mine tickets" : "Alle tickets"}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {mode === "mine"
              ? "Overblik over dine opgaver og dagens vigtigste fokus."
              : "Komplet overblik over alle tickets i systemet."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
          >
            Filter
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Opret ticket
          </button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {filtersOpen ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <TicketsList
            tickets={ticketsForList}
            filters={filters}
            onFiltersChange={setFilters}
            assignees={assignees}
            loading={loading}
            onOpenTicket={handleOpenTicket}
            filterOnly
          />
        </div>
      ) : null}

      <div className={`grid gap-5 ${mode === "mine" ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]" : "grid-cols-1"}`}>
        <TicketsList
          tickets={ticketsForList}
          filters={filters}
          onFiltersChange={setFilters}
          assignees={assignees}
          loading={loading}
          onOpenTicket={handleOpenTicket}
          hideFilters
          compactTable={mode === "all"}
        />
        {mode === "mine" ? (
          <TicketsDayCalendar
            selectedUserId={calendarUserId}
            onSelectedUserIdChange={setCalendarUserId}
            selectedDayKey={calendarDayKey}
            onSelectedDayKeyChange={setCalendarDayKey}
            assignees={assignees}
            viewerId={viewer.id}
            onOpenTicket={handleOpenTicket}
            onTicketUpdated={handleSaved}
            reloadToken={calendarReloadToken}
          />
        ) : null}
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
