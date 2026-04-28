"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MeetingOutcomeSelect } from "@/app/components/meeting-outcome-select";
import {
  meetingOutcomeBadgeClass,
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
} from "@/lib/meeting-outcome";

type MeetingRow = {
  id: string;
  companyName: string;
  phone: string;
  meetingBookedAt: string | null;
  meetingScheduledFor: string | null;
  meetingOutcomeStatus?: string | null;
  bookedByUser: { id: string; name: string; username: string } | null;
  assignedUser?: { id: string; name: string; username: string; phone: string | null } | null;
};

type Assignee = {
  id: string;
  name: string;
  username: string;
  phone: string | null;
};

function outcomeLabel(raw?: string | null) {
  const k = String(raw ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
  return MEETING_OUTCOME_LABELS[k] ?? MEETING_OUTCOME_LABELS[MEETING_OUTCOME_PENDING];
}

export function MeetingsList({ type }: { type: "upcoming" | "past" }) {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role ?? "";
  const userId = session?.user?.id ?? "";
  const isAdmin = role === "ADMIN";

  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(null);
  const [savingAssigneeById, setSavingAssigneeById] = useState<Record<string, boolean>>({});
  const [savedHintById, setSavedHintById] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (type === "upcoming" ? "Kommende møder" : "Tidligere møder"), [type]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/meetings?type=${type}`);
    if (!res.ok) {
      setError("Kunne ikke hente møder");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as MeetingRow[];
    setRows(data);
    setLoading(false);
    setError(null);
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function patchOutcome(id: string, meetingOutcomeStatus: string) {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingOutcomeStatus }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke opdatere udfald");
      return;
    }
    await load();
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
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {type === "upcoming"
            ? "Viser alle møder fra i dag og frem."
            : "Viser alle møder før dags dato (kalenderdag i København)."}
        </p>
      </div>

      {sessionStatus === "loading" && <p className="text-sm text-stone-500">Henter session…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

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
                        href={`/leads/${m.id}`}
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
                  <td className="px-4 py-3 text-stone-700">{m.bookedByUser ? `${m.bookedByUser.name}` : "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meetingOutcomeBadgeClass(
                        m.meetingOutcomeStatus,
                      )}`}
                    >
                      {outcomeLabel(m.meetingOutcomeStatus)}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <MeetingOutcomeSelect
                        value={String(m.meetingOutcomeStatus ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING}
                        onChange={(value) => void patchOutcome(m.id, value)}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

