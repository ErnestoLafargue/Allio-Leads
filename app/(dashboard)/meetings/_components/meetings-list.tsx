"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlockedTimeDialog,
  type BlockedTimeDto,
} from "@/app/(dashboard)/meetings/_components/blocked-time-dialog";
import { MeetingsWeekCalendar } from "@/app/(dashboard)/meetings/_components/meetings-week-calendar";
import type { BlockedTimeRow } from "@/lib/blocked-time-calendar";
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import { weekDayKeys } from "@/lib/meeting-week-calendar";
import { MeetingNoShowRebookDialog } from "@/app/components/meeting-no-show-rebook-dialog";
import { MeetingOutcomeSelect } from "@/app/components/meeting-outcome-select";
import {
  meetingOutcomeBadgeClass,
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
} from "@/lib/meeting-outcome";
import { isMeetingOutcomeLocked, MEETING_OUTCOME_LOCK_DAYS } from "@/lib/meetings";
import {
  buildLeadDetailHref,
  KNOWN_LEAD_SOURCES,
  meetingsUpcomingOpenedFrom,
} from "@/lib/lead-navigation";
import { parseWeekStartParam } from "@/lib/meeting-week-calendar";

type MeetingRow = {
  id: string;
  companyName: string;
  meetingContactName?: string | null;
  phone: string;
  meetingBookedAt: string | null;
  meetingScheduledFor: string | null;
  meetingOutcomeStatus?: string | null;
  bookedByUser: { id: string; name: string; username: string } | null;
  assignedUser?: { id: string; name: string; username: string; phone: string | null } | null;
  campaign?: { id: string; name: string; systemCampaignType?: string | null } | null;
};

type Assignee = {
  id: string;
  name: string;
  username: string;
  phone: string | null;
};

type SellerOption = {
  id: string;
  name: string;
  username: string;
};

function outcomeLabel(raw?: string | null) {
  const k = String(raw ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
  return MEETING_OUTCOME_LABELS[k] ?? MEETING_OUTCOME_LABELS[MEETING_OUTCOME_PENDING];
}

export function MeetingsList({ type }: { type: "upcoming" | "past" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role ?? "";
  const userId = session?.user?.id ?? "";
  const isAdmin = role === "ADMIN";

  const viewMode =
    type === "upcoming" && searchParams.get("view")?.trim().toLowerCase() === "calendar"
      ? "calendar"
      : "list";
  const weekStartDayKey = parseWeekStartParam(searchParams.get("weekStart"));

  const upcomingOpenedFrom = useMemo(
    () =>
      viewMode === "calendar"
        ? meetingsUpcomingOpenedFrom({ view: "calendar", weekStart: weekStartDayKey })
        : KNOWN_LEAD_SOURCES.meetingsUpcoming,
    [viewMode, weekStartDayKey],
  );

  function setUpcomingView(next: "list" | "calendar") {
    if (type !== "upcoming") return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "calendar") {
      params.set("view", "calendar");
      params.set("weekStart", weekStartDayKey);
    } else {
      params.delete("view");
      params.delete("weekStart");
    }
    const qs = params.toString();
    router.replace(`/meetings/upcoming${qs ? `?${qs}` : ""}`);
  }

  function setWeekStartDayKey(dayKey: string) {
    if (type !== "upcoming") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "calendar");
    params.set("weekStart", dayKey);
    router.replace(`/meetings/upcoming?${params.toString()}`);
  }

  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(null);
  const [savingAssigneeById, setSavingAssigneeById] = useState<Record<string, boolean>>({});
  const [savedHintById, setSavedHintById] = useState<Record<string, boolean>>({});
  const [savingSellerById, setSavingSellerById] = useState<Record<string, boolean>>({});
  const [savedSellerHintById, setSavedSellerHintById] = useState<Record<string, boolean>>({});
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [noShowDialog, setNoShowDialog] = useState<{ leadId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Når true: vis kun tidligere møder med status MEETING_BOOKED. */
  const [activeOnlyPast, setActiveOnlyPast] = useState(false);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTimeRow[]>([]);
  const [blockedTimesFull, setBlockedTimesFull] = useState<BlockedTimeDto[]>([]);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);
  const [blockedDialogMode, setBlockedDialogMode] = useState<"create" | "edit">("create");
  const [blockedDialogInitial, setBlockedDialogInitial] = useState<BlockedTimeDto | null>(null);
  const [blockedSaving, setBlockedSaving] = useState(false);

  const title = useMemo(() => (type === "upcoming" ? "Kommende møder" : "Tidligere møder"), [type]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type });
    if (type === "past" && activeOnlyPast) params.set("activeOnly", "true");
    const res = await fetch(`/api/meetings?${params.toString()}`);
    if (!res.ok) {
      setError("Kunne ikke hente møder");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as MeetingRow[];
    setRows(data);
    setLoading(false);
    setError(null);
  }, [type, activeOnlyPast]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadBlockedTimes = useCallback(async () => {
    if (type !== "upcoming" || viewMode !== "calendar") return;
    const keys = weekDayKeys(weekStartDayKey);
    const { start } = copenhagenDayBoundsUtcFromDayKey(keys[0]!);
    const { end } = copenhagenDayBoundsUtcFromDayKey(keys[6]!);
    const qs = new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
    });
    const res = await fetch(`/api/blocked-times?${qs}`);
    if (!res.ok) return;
    const data = (await res.json()) as { blockedTimes: BlockedTimeDto[] };
    const list = data.blockedTimes ?? [];
    setBlockedTimesFull(list);
    setBlockedTimes(
      list.map((b) => ({
        id: b.id,
        userId: b.userId,
        title: b.title,
        startDateTime: b.startDateTime,
        endDateTime: b.endDateTime,
        user: b.user ? { name: b.user.name } : undefined,
      })),
    );
  }, [type, viewMode, weekStartDayKey]);

  useEffect(() => {
    void loadBlockedTimes();
  }, [loadBlockedTimes]);

  function openCreateBlockedDialog() {
    setBlockedDialogMode("create");
    setBlockedDialogInitial(null);
    setBlockedDialogOpen(true);
  }

  function openEditBlockedDialog(row: BlockedTimeDto) {
    setBlockedDialogMode("edit");
    setBlockedDialogInitial(row);
    setBlockedDialogOpen(true);
  }

  async function onBlockedTimesSaved() {
    setBlockedSaving(false);
    setBlockedDialogOpen(false);
    await loadBlockedTimes();
  }

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    async function loadSellers() {
      const res = await fetch("/api/users/for-assignment");
      if (!res.ok) return;
      const data = (await res.json()) as SellerOption[];
      if (!cancelled) setSellers(Array.isArray(data) ? data : []);
    }
    void loadSellers();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (type !== "upcoming") return;
    let cancelled = false;
    async function loadAssignees() {
      const res = await fetch("/api/users/meeting-assignees");
      if (!res.ok) return;
      const data = (await res.json()) as { users: Assignee[]; defaultUserId: string | null };
      if (!cancelled) {
        setAssignees(data.users ?? []);
        setDefaultAssigneeId(data.defaultUserId ?? null);
      }
    }
    void loadAssignees();
    return () => {
      cancelled = true;
    };
  }, [type]);

  async function patchOutcome(
    id: string,
    meetingOutcomeStatus: string,
    options?: { sendToRebooking?: boolean },
  ) {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingOutcomeStatus,
        ...(options?.sendToRebooking !== undefined
          ? { sendToRebooking: options.sendToRebooking }
          : {}),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke opdatere udfald");
      return;
    }
    setError(null);
    await load();
  }

  function handleOutcomeChange(id: string, value: string) {
    if (value === MEETING_OUTCOME_CANCELLED) {
      setNoShowDialog({ leadId: id });
      return;
    }
    void patchOutcome(id, value);
  }

  async function patchSeller(id: string, bookedByUserId: string) {
    setSavingSellerById((prev) => ({ ...prev, [id]: true }));
    setSavedSellerHintById((prev) => ({ ...prev, [id]: false }));
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookedByUserId }),
    });
    setSavingSellerById((prev) => ({ ...prev, [id]: false }));
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme sælger");
      return;
    }
    setError(null);
    await load();
    setSavedSellerHintById((prev) => ({ ...prev, [id]: true }));
    window.setTimeout(() => {
      setSavedSellerHintById((prev) => ({ ...prev, [id]: false }));
    }, 1200);
  }

  async function patchAssignee(id: string, assignedUserId: string) {
    setSavingAssigneeById((prev) => ({ ...prev, [id]: true }));
    setSavedHintById((prev) => ({ ...prev, [id]: false }));
    const res = await fetch(`/api/meetings/${id}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedUserId }),
    });
    setSavingAssigneeById((prev) => ({ ...prev, [id]: false }));
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme tildeling");
      return;
    }
    const data = (await res.json()) as {
      id: string;
      assignedUser: { id: string; name: string; username: string; phone: string | null } | null;
    };
    setRows((prev) =>
      prev.map((row) => (row.id === data.id ? { ...row, assignedUser: data.assignedUser } : row)),
    );
    setSavedHintById((prev) => ({ ...prev, [id]: true }));
    window.setTimeout(() => {
      setSavedHintById((prev) => ({ ...prev, [id]: false }));
    }, 1200);
  }

  function canOpen(m: MeetingRow) {
    return isAdmin || m.bookedByUser?.id === userId;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {type === "upcoming"
              ? "Viser alle møder fra i dag og frem."
              : activeOnlyPast
                ? "Viser kun tidligere møder hvor leadet stadig har status Møde booket."
                : `Viser alle tidligere møder uanset lead-status. Udfald kan ændres så længe mødetidspunktet er inden for ${MEETING_OUTCOME_LOCK_DAYS} dage.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {type === "upcoming" ? (
            <div
              className="inline-flex rounded-lg border border-stone-200 bg-stone-100/80 p-0.5 shadow-sm"
              role="group"
              aria-label="Visning"
            >
              <button
                type="button"
                onClick={() => setUpcomingView("list")}
                aria-pressed={viewMode === "list"}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  viewMode === "list"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900",
                ].join(" ")}
              >
                Liste
              </button>
              <button
                type="button"
                onClick={() => setUpcomingView("calendar")}
                aria-pressed={viewMode === "calendar"}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  viewMode === "calendar"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-600 hover:text-stone-900",
                ].join(" ")}
              >
                Kalender
              </button>
            </div>
          ) : null}
          {type === "past" ? (
            <button
              type="button"
              onClick={() => setActiveOnlyPast((v) => !v)}
              aria-pressed={activeOnlyPast}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition",
                activeOnlyPast
                  ? "border-stone-900 bg-stone-900 text-white hover:bg-stone-800"
                  : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
              ].join(" ")}
              title={
                activeOnlyPast
                  ? "Vis alle tidligere møder uanset lead-status"
                  : "Vis kun møder med aktiv Møde booket-status"
              }
            >
              {activeOnlyPast ? "Vis alle tidligere møder" : "Vis kun aktive"}
            </button>
          ) : null}
        </div>
      </div>

      {sessionStatus === "loading" && <p className="text-sm text-stone-500">Henter session…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {type === "upcoming" && viewMode === "calendar" ? (
        <>
          <MeetingsWeekCalendar
            rows={rows}
            blockedTimes={blockedTimes}
            weekStartDayKey={weekStartDayKey}
            loading={loading}
            openedFrom={upcomingOpenedFrom}
            canOpen={(m) => canOpen(m as MeetingRow)}
            onWeekStartChange={setWeekStartDayKey}
            onBlockTimesClick={openCreateBlockedDialog}
            onBlockedSegmentClick={(seg) => {
              const full = blockedTimesFull.find((b) => b.id === seg.id);
              if (!full) return;
              openEditBlockedDialog(full);
            }}
          />
          <BlockedTimeDialog
            open={blockedDialogOpen}
            mode={blockedDialogMode}
            initial={blockedDialogInitial}
            currentUserId={userId}
            isAdmin={isAdmin}
            defaultUserId={defaultAssigneeId}
            saving={blockedSaving}
            errorText={null}
            onClose={() => setBlockedDialogOpen(false)}
            onSaved={() => void onBlockedTimesSaved()}
          />
        </>
      ) : (
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Virksomhed</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Tildelt til</th>
              <th className="px-4 py-3 font-medium">Mødetid</th>
              <th className="px-4 py-3 font-medium">Booket</th>
              <th className="px-4 py-3 font-medium">Sælger</th>
              <th className="px-4 py-3 font-medium">Udfald</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Admin</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-stone-500">
                  Henter…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-stone-500">
                  Ingen møder.
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="hover:bg-stone-50/80">
                  <td className="px-4 py-3">
                    {canOpen(m) ? (
                      <Link
                        href={buildLeadDetailHref(
                          m.id,
                          type === "upcoming"
                            ? upcomingOpenedFrom
                            : KNOWN_LEAD_SOURCES.meetingsPast,
                        )}
                        className="font-medium text-stone-900 underline-offset-2 hover:underline"
                      >
                        {m.companyName}
                      </Link>
                    ) : (
                      <span
                        className="font-medium text-stone-700"
                        title="Kun bookeren eller administrator kan åbne leadet med noter"
                      >
                        {m.companyName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-700">{m.phone}</td>
                  <td className="px-4 py-3 text-stone-700">
                    {type === "upcoming" ? (
                      assignees.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={m.assignedUser?.id ?? defaultAssigneeId ?? ""}
                            onChange={(e) => void patchAssignee(m.id, e.target.value)}
                            disabled={savingAssigneeById[m.id]}
                            className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:opacity-60"
                          >
                            {!m.assignedUser?.id && !defaultAssigneeId ? (
                              <option value="" disabled>
                                Vælg ansvarlig
                              </option>
                            ) : null}
                            {assignees.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.username})
                              </option>
                            ))}
                          </select>
                          {savedHintById[m.id] ? <span className="text-xs text-emerald-700">Gemt</span> : null}
                        </div>
                      ) : (
                        <span className="text-xs text-stone-500">Ingen brugere med telefonnummer</span>
                      )
                    ) : m.assignedUser ? (
                      `${m.assignedUser.name} (${m.assignedUser.username})`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-800">
                    {m.meetingScheduledFor ? new Date(m.meetingScheduledFor).toLocaleString("da-DK") : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {m.meetingBookedAt ? new Date(m.meetingBookedAt).toLocaleString("da-DK") : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {isAdmin && type === "past" && sellers.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={m.bookedByUser?.id ?? ""}
                          onChange={(e) => void patchSeller(m.id, e.target.value)}
                          disabled={savingSellerById[m.id] || !m.bookedByUser?.id}
                          className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:opacity-60"
                        >
                          {!m.bookedByUser?.id ? (
                            <option value="" disabled>
                              —
                            </option>
                          ) : null}
                          {sellers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        {savedSellerHintById[m.id] ? (
                          <span className="text-xs text-emerald-700">Gemt</span>
                        ) : null}
                      </div>
                    ) : m.bookedByUser ? (
                      `${m.bookedByUser.name}`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meetingOutcomeBadgeClass(
                          m.meetingOutcomeStatus,
                        )}`}
                      >
                        {outcomeLabel(m.meetingOutcomeStatus)}
                      </span>
                      {m.campaign?.systemCampaignType === "rebooking" ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          Genbooking
                        </span>
                      ) : null}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {isMeetingOutcomeLocked(m.meetingScheduledFor) ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium text-stone-500"
                          title={`Udfaldet kan ikke længere ændres — mødetidspunktet ligger mere end ${MEETING_OUTCOME_LOCK_DAYS} dage tilbage.`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          Låst ({"> "}{MEETING_OUTCOME_LOCK_DAYS} dage)
                        </span>
                      ) : (
                        <MeetingOutcomeSelect
                          value={String(m.meetingOutcomeStatus ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING}
                          onChange={(value) => handleOutcomeChange(m.id, value)}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      <MeetingNoShowRebookDialog
        open={noShowDialog != null}
        onClose={() => setNoShowDialog(null)}
        onConfirm={(sendToRebooking) => {
          const id = noShowDialog?.leadId;
          setNoShowDialog(null);
          if (id) void patchOutcome(id, MEETING_OUTCOME_CANCELLED, { sendToRebooking });
        }}
      />
    </div>
  );
}

