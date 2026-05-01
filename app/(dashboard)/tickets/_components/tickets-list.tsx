"use client";

import { useMemo, useState } from "react";
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_ORDER,
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
  /** "active" = alt undtagen Færdig. "done" = kun løste opgaver (grå styling). */
  view: "active" | "done";
};

export const DEFAULT_LIST_FILTERS: TicketListFilters = {
  scope: "mine",
  status: "all",
  priority: "all",
  assigneeId: "all",
  deadlineRange: "all",
  view: "active",
};

type Props = {
  tickets: TicketDto[];
  filters: TicketListFilters;
  onFiltersChange: (next: TicketListFilters) => void;
  assignees: AssignableUser[];
  loading: boolean;
  onOpenTicket: (id: string) => void;
  hideFilters?: boolean;
  filterOnly?: boolean;
  compactTable?: boolean;
};

type SortColumn = "title" | "assignee" | "priority" | "deadline" | "status" | "createdBy";
type SortDirection = "asc" | "desc";

export function TicketsList({
  tickets,
  filters,
  onFiltersChange,
  assignees,
  loading,
  onOpenTicket,
  hideFilters = false,
  filterOnly = false,
  compactTable = false,
}: Props) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null);
  const filtered = useMemo(() => filterTickets(tickets, filters), [tickets, filters]);
  const sorted = useMemo(
    () => sortTickets(filtered, sortColumn, sortDirection),
    [filtered, sortColumn, sortDirection],
  );

  function update<K extends keyof TicketListFilters>(key: K, value: TicketListFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function cycleSort(column: SortColumn) {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    if (sortDirection === "desc") {
      setSortColumn(null);
      setSortDirection(null);
      return;
    }
    setSortDirection("asc");
  }

  function sortIndicator(column: SortColumn): string {
    if (sortColumn !== column || !sortDirection) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  }

  return (
    <section className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      {!hideFilters ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-4 py-3">
        <SegmentedToggle
          value={filters.view}
          onChange={(v) => update("view", v)}
          options={[
            { value: "active", label: "Aktive" },
            { value: "done", label: "Løste opgaver" },
          ]}
        />

        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => update("status", v as TicketStatus | "all")}
          options={[
            { value: "all", label: "Alle" },
            ...TICKET_STATUS_ORDER.filter((s) => (filters.view === "done" ? s === "done" : s !== "done")).map(
              (s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }),
            ),
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
      ) : null}
      {filterOnly ? null : (

      <div className="overflow-x-auto">
        <table className={`w-full text-left text-sm ${compactTable ? "table-fixed" : ""}`}>
          {compactTable ? (
            <colgroup>
              <col className="w-[48%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
            </colgroup>
          ) : null}
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-2.5 font-medium">
                <SortHeader label={`Titel${sortIndicator("title")}`} onClick={() => cycleSort("title")} />
              </th>
              <th className="px-4 py-2.5 font-medium">
                <SortHeader label={`Tildelt${sortIndicator("assignee")}`} onClick={() => cycleSort("assignee")} />
              </th>
              <th className="px-4 py-2.5 font-medium">
                <SortHeader label={`Prioritet${sortIndicator("priority")}`} onClick={() => cycleSort("priority")} />
              </th>
              <th className="px-4 py-2.5 font-medium">
                <SortHeader label={`Deadline${sortIndicator("deadline")}`} onClick={() => cycleSort("deadline")} />
              </th>
              <th className="px-4 py-2.5 font-medium">
                <SortHeader label={`Status${sortIndicator("status")}`} onClick={() => cycleSort("status")} />
              </th>
              <th className="px-4 py-2.5 font-medium">
                <SortHeader label={`Oprettet af${sortIndicator("createdBy")}`} onClick={() => cycleSort("createdBy")} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  Henter tickets…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  Ingen tickets matcher dine filtre.
                </td>
              </tr>
            ) : (
              sorted.map((t) => {
                const isDone = t.status === "done";
                return (
                <tr
                  key={t.id}
                  onClick={() => onOpenTicket(t.id)}
                  className={[
                    "cursor-pointer transition-colors",
                    isDone ? "bg-stone-50/60 text-stone-500 hover:bg-stone-100" : "hover:bg-stone-50",
                  ].join(" ")}
                >
                  <td className="px-4 py-3">
                    <div className={`${
                      isDone ? "font-medium text-stone-500 line-through" : "font-medium text-stone-900"
                    } ${compactTable ? "line-clamp-1" : ""}`}>
                      {t.title}
                    </div>
                    {!compactTable && t.description ? (
                      <div className="mt-0.5 line-clamp-1 text-xs text-stone-400">
                        {t.description}
                      </div>
                    ) : null}
                  </td>
                  <td className={[
                    "px-4 py-3",
                    compactTable ? "align-middle" : "",
                    isDone ? "text-stone-500" : "text-stone-700",
                  ].join(" ")}>
                    {t.isShared ? "Vilkårlig / alle" : t.assignedUser.name}
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
                  <td className={["px-4 py-3", isDone ? "text-stone-500" : "text-stone-700"].join(" ")}>{t.createdBy.name}</td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}

function SortHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center text-left text-xs font-semibold uppercase tracking-wide text-stone-600 hover:text-stone-900"
    >
      {label}
    </button>
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
    // "view" styrer aktiv vs. løste — done er aldrig blandet ind i Aktive.
    if (f.view === "active" && t.status === "done") return false;
    if (f.view === "done" && t.status !== "done") return false;

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

function sortTickets(
  tickets: TicketDto[],
  column: SortColumn | null,
  direction: SortDirection | null,
): TicketDto[] {
  const list = [...tickets];
  if (!column || !direction) {
    list.sort(compareDefault);
    return list;
  }
  const multiplier = direction === "asc" ? 1 : -1;
  list.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case "title":
        cmp = cmpText(a.title, b.title);
        break;
      case "assignee":
        cmp = cmpText(ticketAssigneeName(a), ticketAssigneeName(b));
        break;
      case "priority":
        cmp = cmpPriority(a.priority, b.priority);
        break;
      case "deadline":
        cmp = cmpDeadline(a.deadline, b.deadline);
        break;
      case "status":
        cmp = cmpStatus(a.status, b.status);
        break;
      case "createdBy":
        cmp = cmpText(a.createdBy.name, b.createdBy.name);
        break;
      default:
        cmp = 0;
        break;
    }
    if (cmp !== 0) return cmp * multiplier;
    return compareDefault(a, b);
  });
  return list;
}

function compareDefault(a: TicketDto, b: TicketDto): number {
  const deadlineCmp = cmpDeadline(a.deadline, b.deadline);
  if (deadlineCmp !== 0) return deadlineCmp;
  const priorityCmp = cmpPriority(a.priority, b.priority);
  if (priorityCmp !== 0) return priorityCmp;
  const statusCmp = cmpStatus(a.status, b.status);
  if (statusCmp !== 0) return statusCmp;
  const createdCmp = cmpDateIso(a.createdAt, b.createdAt);
  if (createdCmp !== 0) return createdCmp;
  return cmpText(a.title, b.title);
}

function ticketAssigneeName(t: TicketDto): string {
  return t.isShared ? "Vilkårlig / alle" : t.assignedUser.name;
}

function cmpText(a: string, b: string): number {
  return a.localeCompare(b, "da", { sensitivity: "base" });
}

function cmpPriority(a: TicketPriority, b: TicketPriority): number {
  const rank = new Map(TICKET_PRIORITY_ORDER.map((p, i) => [p, i]));
  return (rank.get(a) ?? 99) - (rank.get(b) ?? 99);
}

function cmpStatus(a: TicketStatus, b: TicketStatus): number {
  const rank = new Map(TICKET_STATUS_ORDER.map((s, i) => [s, i]));
  return (rank.get(a) ?? 99) - (rank.get(b) ?? 99);
}

function cmpDeadline(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b);
  if (a && !b) return -1;
  if (!a && b) return 1;
  return 0;
}

function cmpDateIso(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
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
