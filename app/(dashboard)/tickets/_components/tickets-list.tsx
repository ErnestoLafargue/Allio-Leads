"use client";

import { useMemo } from "react";
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  type TicketPriority,
} from "@/lib/ticket-priority";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
  type TicketStatus,
} from "@/lib/ticket-status";
import { TicketPriorityBadge } from "./ticket-priority-badge";
import { TicketStatusBadge } from "./ticket-status-badge";
import { TicketDeadlineLabel } from "./ticket-deadline-label";
import type { AssignableUser, TicketDto } from "./tickets-shared";

export type TicketListFilters = {
  scope: "mine" | "all";
  status: TicketStatus | "all";
  priority: TicketPriority | "all";
  assigneeId: string | "all";
  deadlineRange: "all" | "no_deadline" | "today" | "this_week" | "overdue";
};

export const DEFAULT_LIST_FILTERS: TicketListFilters = {
  scope: "mine",
  status: "all",
  priority: "all",
  assigneeId: "all",
  deadlineRange: "all",
};

type Props = {
  tickets: TicketDto[];
  filters: TicketListFilters;
  onFiltersChange: (next: TicketListFilters) => void;
  assignees: AssignableUser[];
  loading: boolean;
  onOpenTicket: (id: string) => void;
};

export function TicketsList({
  tickets,
  filters,
  onFiltersChange,
  assignees,
  loading,
  onOpenTicket,
}: Props) {
  const filtered = useMemo(() => filterTickets(tickets, filters), [tickets, filters]);

  function update<K extends keyof TicketListFilters>(key: K, value: TicketListFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  return (
    <section className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-4 py-3">
        <SegmentedToggle
          value={filters.scope}
          onChange={(v) => update("scope", v)}
          options={[
            { value: "mine", label: "Mine tickets" },
            { value: "all", label: "Alle tickets" },
          ]}
        />

        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => update("status", v as TicketStatus | "all")}
          options={[
            { value: "all", label: "Alle" },
            ...TICKET_STATUS_ORDER.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] })),
          ]}
        />

        <FilterSelect
          label="Prioritet"
          value={filters.priority}
          onChange={(v) => update("priority", v as TicketPriority | "all")}
          options={[
            { value: "all", label: "Alle" },
            ...TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_LABELS[p] })),
          ]}
        />

        <FilterSelect
          label="Deadline"
          value={filters.deadlineRange}
          onChange={(v) => update("deadlineRange", v as TicketListFilters["deadlineRange"])}
          options={[
            { value: "all", label: "Alle" },
            { value: "overdue", label: "Overskredet" },
            { value: "today", label: "I dag" },
            { value: "this_week", label: "Denne uge" },
            { value: "no_deadline", label: "Ingen deadline" },
          ]}
        />

        <FilterSelect
          label="Tildelt"
          value={filters.assigneeId}
          onChange={(v) => update("assigneeId", v)}
          options={[
            { value: "all", label: "Alle" },
            ...assignees.map((u) => ({ value: u.id, label: `${u.name}` })),
          ]}
        />

        <span className="ml-auto text-xs font-medium text-stone-500">
          {loading ? "Henter…" : `${filtered.length} ticket${filtered.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">Titel</th>
              <th className="px-4 py-2.5 font-medium">Tildelt</th>
              <th className="px-4 py-2.5 font-medium">Prioritet</th>
              <th className="px-4 py-2.5 font-medium">Deadline</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Oprettet af</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  Henter tickets…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  Ingen tickets matcher dine filtre.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onOpenTicket(t.id)}
                  className="cursor-pointer transition-colors hover:bg-stone-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-900">{t.title}</div>
                    {t.description ? (
                      <div className="mt-0.5 line-clamp-1 text-xs text-stone-500">
                        {t.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {t.assignedUser.name}
                  </td>
                  <td className="px-4 py-3">
                    <TicketPriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <TicketDeadlineLabel deadline={t.deadline} />
                  </td>
                  <td className="px-4 py-3">
                    <TicketStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-stone-700">{t.createdBy.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-stone-300 bg-stone-100 p-0.5 text-xs font-semibold">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={[
              "rounded-md px-3 py-1 transition",
              active ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function filterTickets(tickets: TicketDto[], f: TicketListFilters): TicketDto[] {
  const today = todayDayKey();
  const inSameWeek = sameWeekChecker(today);

  return tickets.filter((t) => {
    if (f.status !== "all" && t.status !== f.status) return false;
    if (f.priority !== "all" && t.priority !== f.priority) return false;
    if (f.assigneeId !== "all" && t.assignedUser.id !== f.assigneeId) return false;

    switch (f.deadlineRange) {
      case "no_deadline":
        if (t.deadline) return false;
        break;
      case "today":
        if (t.deadline !== today) return false;
        break;
      case "this_week":
        if (!t.deadline || !inSameWeek(t.deadline)) return false;
        break;
      case "overdue": {
        if (!t.deadline) return false;
        if (t.status === "done") return false;
        if (t.deadline >= today) return false;
        break;
      }
      case "all":
      default:
        break;
    }
    return true;
  });
}

function todayDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sameWeekChecker(todayKey: string) {
  const [y, m, d] = todayKey.split("-").map(Number);
  const todayUtc = new Date(Date.UTC(y, m - 1, d));
  const dow = (todayUtc.getUTCDay() + 6) % 7;
  const monday = new Date(todayUtc.getTime() - dow * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const start = fmt.format(monday);
  const end = fmt.format(sunday);
  return (deadline: string) => deadline >= start && deadline <= end;
}
