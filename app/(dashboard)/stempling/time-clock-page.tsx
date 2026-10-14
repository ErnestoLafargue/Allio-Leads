"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  formatClockStamp,
  formatClockTime,
  formatClockedDuration,
  formatClockedLive,
  notifyTimeClockChanged,
  shiftDayKey,
  withLiveOverviewSeconds,
  type TimeClockEntryDto,
  type TimeClockOverview,
} from "@/lib/time-clock";
import { useDesktopComputer } from "@/lib/use-desktop-computer";
import { useTimeClock } from "@/lib/use-time-clock";
import { TimeClockAdminEditForm } from "./time-clock-admin-edit";

export function TimeClockPage() {
  const { data: session } = useSession();
  const isComputer = useDesktopComputer();
  const { status, error, busy, punch, openSeconds, todaySeconds, reload, nowMs } = useTimeClock();
  const [overview, setOverview] = useState<TimeClockOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ userId: string; entryId: string | "new" } | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const loadOverview = useCallback(async (dayKey: string) => {
    const qs = new URLSearchParams();
    if (dayKey) qs.set("dayKey", dayKey);
    const res = await fetch(`/api/time-clock/overview?${qs.toString()}`);
    if (!res.ok) {
      setOverviewError("Kunne ikke hente oversigten");
      return;
    }
    const json = (await res.json()) as TimeClockOverview;
    setOverview(json);
    setOverviewError(null);
  }, []);

  useEffect(() => {
    void loadOverview(selectedDayKey);
  }, [loadOverview, selectedDayKey, status?.clockedIn, status?.openEntry?.id]);

  const clockedIn = status?.clockedIn === true;
  const dayKey = selectedDayKey || overview?.dayKey || "";
  const isAdmin = overview?.isAdmin === true;
  const headingAll = session?.user?.role === "ADMIN" || isAdmin;
  const viewingToday = overview != null && overview.dayKey === overview.todayKey;
  const liveOverview = overview ? withLiveOverviewSeconds(overview, nowMs) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Stempling</h1>
        <p className="mt-1 text-sm text-stone-600">
          {isComputer
            ? "Stemple ind når du starter, og ud når du er færdig. Tiderne vises i København-tid."
            : "Stempling kan kun ske fra en computer på kontoret."}
        </p>
      </div>

      {isComputer ? (
        <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                {clockedIn ? "Du er stemplet ind" : "Du er stemplet ud"}
              </p>
              <p className="mt-1 font-semibold tabular-nums text-stone-900">
                {clockedIn ? (
                  <span className="text-3xl tracking-tight">{formatClockedLive(openSeconds)}</span>
                ) : (
                  <span className="text-3xl tracking-tight text-stone-400">—</span>
                )}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                I dag i alt {formatClockedDuration(todaySeconds)}
                {status?.openEntry
                  ? ` · ind kl. ${formatClockTime(status.openEntry.punchedInAt)}`
                  : null}
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !status}
              onClick={() => void punch(clockedIn ? "out" : "in")}
              className={[
                "inline-flex h-12 min-w-[12rem] items-center justify-center rounded-xl px-6 text-sm font-semibold shadow-sm transition",
                clockedIn
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700",
                "disabled:cursor-wait disabled:opacity-70",
              ].join(" ")}
            >
              {busy ? "Vent…" : clockedIn ? "Stemple ud" : "Stemple ind"}
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Åbn Allio Leads på din computer på kontoret for at stemple ind og ud.
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-900">
            {headingAll ? "Alle stemplinger" : "Mine stemplinger"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDayKey((k) => shiftDayKey(k || dayKey, -1))}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              Forrige dag
            </button>
            <input
              type="date"
              value={dayKey}
              max={overview?.todayKey}
              onChange={(e) => setSelectedDayKey(e.target.value)}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-800"
            />
            <button
              type="button"
              onClick={() => {
                setSelectedDayKey(overview?.todayKey ?? "");
                void reload();
              }}
              disabled={viewingToday}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              I dag
            </button>
            {liveOverview ? (
              <p className="text-xs font-medium capitalize text-stone-500">{liveOverview.dayLabel}</p>
            ) : null}
          </div>
        </div>

        {isAdmin && liveOverview && viewingToday ? (
          <p className="text-sm text-stone-600">
            {liveOverview.clockedInCount} stemplet ind nu
            <span className="text-stone-400"> · </span>
            Åbn en sælger for at rette ind/ud, hvis der er sket en fejl.
          </p>
        ) : isAdmin ? (
          <p className="text-sm text-stone-500">
            Åbn en sælger for at rette ind/ud, hvis der er sket en fejl.
          </p>
        ) : null}

        {overviewError ? (
          <p className="text-sm text-rose-600">
            {overviewError}{" "}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void loadOverview(selectedDayKey)}
            >
              Prøv igen
            </button>
          </p>
        ) : null}

        {!liveOverview && !overviewError ? (
          <p className="text-sm text-stone-500">Henter oversigten…</p>
        ) : liveOverview ? (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-stone-100 bg-stone-50 text-stone-600">
                <tr>
                  {isAdmin ? <th className="w-10 px-3 py-2.5 font-medium" /> : null}
                  {isAdmin ? <th className="px-3 py-2.5 font-medium">Navn</th> : null}
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Ind</th>
                  <th className="px-3 py-2.5 font-medium">Ud</th>
                  <th className="px-3 py-2.5 text-right font-medium tabular-nums">Timer</th>
                  {isAdmin ? <th className="px-3 py-2.5 text-right font-medium">Ret</th> : null}
                </tr>
              </thead>
              <tbody>
                {liveOverview.rows.map((row) => {
                  const first = row.entries[0];
                  const last = row.entries[row.entries.length - 1];
                  const many = row.entries.length > 1;
                  const dayOpen = row.entries.some((e) => e.open);
                  const statusClockedIn = viewingToday ? row.clockedIn : dayOpen;
                  const expanded = expandedUserId === row.userId;
                  const summaryIn = first ? formatClockStamp(first.punchedInAt, liveOverview.dayKey) : "—";
                  const summaryOut =
                    !last || last.open
                      ? "—"
                      : formatClockStamp(last.punchedOutAt ?? last.punchedInAt, liveOverview.dayKey);
                  return (
                    <UserRows
                      key={row.userId}
                      userId={row.userId}
                      isAdmin={isAdmin}
                      name={row.name}
                      username={row.username}
                      role={row.role}
                      clockedIn={statusClockedIn}
                      emptyDay={row.entries.length === 0}
                      viewDayKey={liveOverview.dayKey}
                      totalSeconds={row.totalSeconds}
                      summaryIn={many ? `${summaryIn} · ${row.entries.length} tider` : summaryIn}
                      summaryOut={many ? "se tider" : summaryOut}
                      expanded={expanded}
                      onToggle={
                        isAdmin
                          ? () => {
                              if (expanded) {
                                setExpandedUserId(null);
                                setEdit((e) => (e?.userId === row.userId ? null : e));
                              } else {
                                setExpandedUserId(row.userId);
                              }
                            }
                          : undefined
                      }
                      entries={row.entries}
                      showDetails={isAdmin ? expanded : many}
                      editEntryId={
                        isAdmin && edit?.userId === row.userId ? edit.entryId : null
                      }
                      onStartEdit={
                        isAdmin
                          ? (entryId) => {
                              setExpandedUserId(row.userId);
                              setEdit({ userId: row.userId, entryId });
                            }
                          : undefined
                      }
                      onCancelEdit={() => setEdit(null)}
                      onSaved={() => {
                        setEdit(null);
                        void loadOverview(selectedDayKey);
                      }}
                      onDeleteEntry={
                        isAdmin
                          ? async (entryId) => {
                              if (!window.confirm("Slet denne stempling?")) return;
                              setDeleteBusyId(entryId);
                              try {
                                const res = await fetch(
                                  `/api/time-clock/entries/${encodeURIComponent(entryId)}`,
                                  { method: "DELETE" },
                                );
                                if (!res.ok) {
                                  const j = (await res.json().catch(() => null)) as {
                                    error?: string;
                                  } | null;
                                  window.alert(j?.error ?? "Kunne ikke slette.");
                                  return;
                                }
                                notifyTimeClockChanged();
                                if (edit?.entryId === entryId) setEdit(null);
                                void loadOverview(selectedDayKey);
                              } finally {
                                setDeleteBusyId(null);
                              }
                            }
                          : undefined
                      }
                      deleteBusyId={deleteBusyId}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function UserRows({
  userId,
  isAdmin,
  name,
  username,
  role,
  clockedIn,
  emptyDay,
  viewDayKey,
  totalSeconds,
  summaryIn,
  summaryOut,
  expanded,
  onToggle,
  entries,
  showDetails,
  editEntryId,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onDeleteEntry,
  deleteBusyId,
}: {
  userId: string;
  isAdmin: boolean;
  name: string;
  username: string;
  role: string;
  clockedIn: boolean;
  emptyDay: boolean;
  viewDayKey: string;
  totalSeconds: number;
  summaryIn: string;
  summaryOut: string;
  expanded: boolean;
  onToggle?: () => void;
  entries: TimeClockOverview["rows"][number]["entries"];
  showDetails: boolean;
  editEntryId: string | "new" | null;
  onStartEdit?: (entryId: string | "new") => void;
  onCancelEdit?: () => void;
  onSaved?: () => void;
  onDeleteEntry?: (entryId: string) => void;
  deleteBusyId: string | null;
}) {
  return (
    <>
      <tr className="border-b border-stone-100 last:border-0">
        {isAdmin ? (
          <td className="px-3 py-2.5">
            {onToggle ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="rounded p-1 text-stone-400 hover:bg-stone-50 hover:text-stone-700"
              >
                <svg
                  className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ) : null}
          </td>
        ) : null}
        {isAdmin ? (
          <td className="px-3 py-2.5">
            <p className="font-medium text-stone-900">{name}</p>
            <p className="text-[11px] text-stone-500">
              {username} · {role === "ADMIN" ? "Admin" : "Sælger"}
            </p>
          </td>
        ) : null}
        <td className="px-3 py-2.5">
          {emptyDay ? (
            <span className="text-xs text-stone-400">Ingen</span>
          ) : clockedIn ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Stemplet ind
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
              Stemplet ud
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 tabular-nums text-stone-800">{summaryIn}</td>
        <td className="px-3 py-2.5 tabular-nums text-stone-800">{summaryOut}</td>
        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-stone-900">
          {totalSeconds > 0 ? formatClockedDuration(totalSeconds) : "—"}
        </td>
        {isAdmin ? (
          <td className="px-3 py-2.5 text-right">
            {onStartEdit ? (
              <button
                type="button"
                onClick={() => onStartEdit(entries[0]?.id ?? "new")}
                className="text-xs font-medium text-emerald-800 hover:underline"
              >
                {emptyDay ? "Tilføj" : "Ret"}
              </button>
            ) : null}
          </td>
        ) : null}
      </tr>
      {showDetails
        ? entries.map((e) =>
            editEntryId === e.id ? (
              <AdminEditRow
                key={`${e.id}-edit`}
                userId={userId}
                viewDayKey={viewDayKey}
                entry={e}
                onCancel={onCancelEdit}
                onSaved={onSaved}
              />
            ) : (
              <tr key={e.id} className="border-b border-stone-50 bg-stone-50/60 last:border-0">
                {isAdmin ? <td /> : null}
                {isAdmin ? <td className="px-3 py-2 text-xs text-stone-500">Tid</td> : null}
                <td className="px-3 py-2 text-xs text-stone-500">{e.open ? "Åben" : "Lukket"}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-stone-700">
                  {formatClockStamp(e.punchedInAt, viewDayKey)}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-stone-700">
                  {e.open ? "—" : formatClockStamp(e.punchedOutAt ?? e.punchedInAt, viewDayKey)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-stone-700">
                  {formatClockedDuration(e.seconds)}
                </td>
                {isAdmin ? (
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {onStartEdit ? (
                        <button
                          type="button"
                          onClick={() => onStartEdit(e.id)}
                          className="text-xs font-medium text-emerald-800 hover:underline"
                        >
                          Ret
                        </button>
                      ) : null}
                      {onDeleteEntry ? (
                        <button
                          type="button"
                          disabled={deleteBusyId === e.id}
                          onClick={() => onDeleteEntry(e.id)}
                          className="text-xs font-medium text-rose-700 hover:underline disabled:opacity-60"
                        >
                          Slet
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ),
          )
        : null}
      {showDetails && isAdmin && editEntryId === "new" ? (
        <AdminEditRow
          userId={userId}
          viewDayKey={viewDayKey}
          entry={null}
          onCancel={onCancelEdit}
          onSaved={onSaved}
        />
      ) : null}
      {showDetails && isAdmin && entries.length === 0 && editEntryId !== "new" ? (
        <tr className="border-b border-stone-50 bg-stone-50/60">
          <td />
          <td />
          <td className="px-3 py-2 text-xs text-stone-400" colSpan={3}>
            Ingen stempling denne dag
          </td>
          <td className="px-3 py-2 text-right">
            {onStartEdit ? (
              <button
                type="button"
                onClick={() => onStartEdit("new")}
                className="text-xs font-medium text-emerald-800 hover:underline"
              >
                Tilføj
              </button>
            ) : null}
          </td>
        </tr>
      ) : null}
      {showDetails && isAdmin && entries.length > 0 && editEntryId !== "new" ? (
        <tr className="border-b border-stone-50 bg-stone-50/40">
          <td colSpan={6} />
          <td className="px-3 py-2 text-right">
            {onStartEdit ? (
              <button
                type="button"
                onClick={() => onStartEdit("new")}
                className="text-xs font-medium text-stone-600 hover:underline"
              >
                Tilføj tid
              </button>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AdminEditRow({
  userId,
  viewDayKey,
  entry,
  onCancel,
  onSaved,
}: {
  userId: string;
  viewDayKey: string;
  entry: TimeClockEntryDto | null;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  return (
    <tr className="border-b border-stone-100 bg-emerald-50/40">
      <td className="px-3 py-3" colSpan={7}>
        <p className="mb-2 text-xs font-medium text-stone-700">
          {entry ? "Ret stempling" : "Tilføj stempling"}
        </p>
        <TimeClockAdminEditForm
          userId={userId}
          viewDayKey={viewDayKey}
          entry={entry}
          onCancel={() => onCancel?.()}
          onSaved={() => onSaved?.()}
        />
      </td>
    </tr>
  );
}
