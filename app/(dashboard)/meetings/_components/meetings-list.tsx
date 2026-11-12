"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockedTimeDialog,
  type BlockedTimeCreatePrefill,
  type BlockedTimeDto,
} from "@/app/(dashboard)/meetings/_components/blocked-time-dialog";
import { MeetingBlockSettingDialog } from "@/app/(dashboard)/meetings/_components/meeting-block-setting-dialog";
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
import { isMeetingOutcomeLocked, MEETING_OUTCOME_LOCK_DAYS } from "@/lib/meeting-outcome-lock";
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
  meetingType?: string | null;
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

const BLOCK_DAY_FMT = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const BLOCK_TIME_FMT = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  hour: "2-digit",
  minute: "2-digit",
});

/** «Victor Lafargue, fre. 13. nov. 10.00–11.00» — så man kan se, hvor blokeringen landede. */
function describeBlockedTime(b: BlockedTimeDto): string {
  const start = new Date(b.startDateTime);
  const end = new Date(b.endDateTime);
  const startDay = BLOCK_DAY_FMT.format(start);
  const endDay = BLOCK_DAY_FMT.format(end);
  const when =
    startDay === endDay
      ? `${startDay} ${BLOCK_TIME_FMT.format(start)}–${BLOCK_TIME_FMT.format(end)}`
      : `${startDay} ${BLOCK_TIME_FMT.format(start)} – ${endDay} ${BLOCK_TIME_FMT.format(end)}`;
  return b.user?.name ? `${b.user.name}, ${when}` : when;
}

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
  const weekStartParam = searchParams.get("weekStart");
  const weekStartDayKey = useMemo(() => parseWeekStartParam(weekStartParam), [weekStartParam]);

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
  /** Alle brugere en blokering kan tilhøre (kørende sælgere først). */
  const [blockOwners, setBlockOwners] = useState<Assignee[]>([]);
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(null);
  const [savingAssigneeById, setSavingAssigneeById] = useState<Record<string, boolean>>({});
  const [savedHintById, setSavedHintById] = useState<Record<string, boolean>>({});
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
  const [blockedDialogPrefill, setBlockedDialogPrefill] = useState<BlockedTimeCreatePrefill | null>(
    null,
  );
  const [blockedDialogSellerId, setBlockedDialogSellerId] = useState<string | null>(null);
  /** Ny nøgle pr. åbning, så dialogen altid starter med en frisk formular. */
  const [blockedDialogKey, setBlockedDialogKey] = useState(0);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const blockedNoticeTimerRef = useRef<number | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const title = useMemo(() => (type === "upcoming" ? "Kommende møder" : "Tidligere møder"), [type]);

  const loadSeqRef = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    const params = new URLSearchParams({ type });
    if (type === "past" && activeOnlyPast) params.set("activeOnly", "true");
    if (type === "upcoming" && viewMode === "calendar") {
      // Kalenderen viser hele den valgte uge — også møder fra før i dag.
      const keys = weekDayKeys(weekStartDayKey);
      params.set("from", copenhagenDayBoundsUtcFromDayKey(keys[0]!).start.toISOString());
      params.set("to", copenhagenDayBoundsUtcFromDayKey(keys[6]!).end.toISOString());
    }
    const res = await fetch(`/api/meetings?${params.toString()}`);
    // Ignorér svar fra en ældre forespørgsel (fx ved hurtigt ugeskift).
    if (seq !== loadSeqRef.current) return;
    if (!res.ok) {
      setError("Kunne ikke hente møder");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as MeetingRow[];
    if (seq !== loadSeqRef.current) return;
    setRows(data);
    setLoading(false);
    setError(null);
  }, [type, activeOnlyPast, viewMode, weekStartDayKey]);

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

  function openCreateBlockedDialog(prefill: BlockedTimeCreatePrefill | null, sellerId?: string) {
    setBlockedDialogMode("create");
    setBlockedDialogInitial(null);
    setBlockedDialogPrefill(prefill);
    setBlockedDialogSellerId(sellerId ?? null);
    setBlockedDialogKey((k) => k + 1);
    setBlockedDialogOpen(true);
  }

  function openEditBlockedDialog(row: BlockedTimeDto) {
    setBlockedDialogMode("edit");
    setBlockedDialogInitial(row);
    setBlockedDialogPrefill(null);
    setBlockedDialogSellerId(null);
    setBlockedDialogKey((k) => k + 1);
    setBlockedDialogOpen(true);
  }

  function showBlockedNotice(text: string) {
    setBlockedNotice(text);
    if (blockedNoticeTimerRef.current) window.clearTimeout(blockedNoticeTimerRef.current);
    blockedNoticeTimerRef.current = window.setTimeout(() => setBlockedNotice(null), 6000);
  }

  async function onBlockedTimesSaved(saved: BlockedTimeDto | null) {
    setBlockedDialogOpen(false);
    showBlockedNotice(saved ? `Blokering gemt: ${describeBlockedTime(saved)}` : "Blokering slettet.");
    await loadBlockedTimes();
  }

  useEffect(() => {
    if (type !== "upcoming") return;
    let cancelled = false;
    async function loadAssignees() {
      const res = await fetch("/api/users/meeting-assignees");
      if (!res.ok) return;
      const data = (await res.json()) as {
        users: Assignee[];
        defaultUserId: string | null;
        blockOwners?: Assignee[];
      };
      if (!cancelled) {
        setAssignees(data.users ?? []);
        setBlockOwners(data.blockOwners ?? data.users ?? []);
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
              ? viewMode === "calendar"
                ? "Viser alle møder i den valgte uge — også dem før i dag."
                : "Viser alle møder fra i dag og frem."
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
      {blockedNotice && type === "upcoming" && viewMode === "calendar" ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {blockedNotice}
        </p>
      ) : null}

      {type === "upcoming" && viewMode === "calendar" ? (
        <>
          <MeetingsWeekCalendar
            rows={rows}
            sellers={assignees}
            blockedTimes={blockedTimes}
            weekStartDayKey={weekStartDayKey}
            loading={loading}
            openedFrom={upcomingOpenedFrom}
            canOpen={(m) => canOpen(m as MeetingRow)}
            onWeekStartChange={setWeekStartDayKey}
            onBlockTimesClick={(sellerId) => openCreateBlockedDialog(null, sellerId)}
            onSettingsClick={isAdmin ? () => setSettingsDialogOpen(true) : undefined}
            onBlockedSegmentClick={(seg) => {
              const full = blockedTimesFull.find((b) => b.id === seg.id);
              if (!full) return;
              openEditBlockedDialog(full);
            }}
            onEmptySlotClick={(slot) =>
              openCreateBlockedDialog(
                { startDate: slot.dayKey, startTime: slot.startTime },
                slot.sellerId,
              )
            }
          />
          {blockedDialogOpen ? (
            <BlockedTimeDialog
              key={blockedDialogKey}
              mode={blockedDialogMode}
              initial={blockedDialogInitial}
              createPrefill={blockedDialogPrefill}
              preferredUserId={blockedDialogSellerId}
              currentUserId={userId}
              assignees={blockOwners}
              sellerIds={assignees.map((u) => u.id)}
              defaultUserId={defaultAssigneeId}
              onClose={() => setBlockedDialogOpen(false)}
              onSaved={(saved) => void onBlockedTimesSaved(saved)}
            />
          ) : null}
          <MeetingBlockSettingDialog
            open={settingsDialogOpen}
            onClose={() => setSettingsDialogOpen(false)}
          />
        </>
      ) : (
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Virksomhed</th>
              <th className="px-4 py-3 font-medium">Mødekontakt</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Tildelt til</th>
              <th className="px-4 py-3 font-medium">Mødetid</th>
              <th className="px-4 py-3 font-medium">Booket af</th>
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
                  <td className="px-4 py-3 text-stone-800">{m.meetingContactName?.trim() || "—"}</td>
                  <td className="px-4 py-3 text-stone-700">{m.phone}</td>
                  <td className="px-4 py-3 text-stone-700">
                    {type === "upcoming" ? (
                      assignees.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={m.assignedUser?.id ?? ""}
                            onChange={(e) => void patchAssignee(m.id, e.target.value)}
                            disabled={savingAssigneeById[m.id] || !isAdmin}
                            title={isAdmin ? undefined : "Kun administrator kan ændre tildelingen"}
                            className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:opacity-60"
                          >
                            <option value="">Ingen tildelt</option>
                            {assignees.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                          {savedHintById[m.id] ? <span className="text-xs text-emerald-700">Gemt</span> : null}
                        </div>
                      ) : (
                        <span className="text-xs text-stone-500">Ingen kørende sælgere</span>
                      )
                    ) : m.assignedUser ? (
                      m.assignedUser.name
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-800">
                    {m.meetingScheduledFor ? new Date(m.meetingScheduledFor).toLocaleString("da-DK") : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {/* Altid den bruger, der bookede mødet — kan ikke ændres. */}
                    {m.bookedByUser?.name ?? "—"}
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

