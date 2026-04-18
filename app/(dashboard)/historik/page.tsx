"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { copenhagenDayKey } from "@/lib/copenhagen-day";

type UserOption = { id: string; name: string; username: string; role: string };

type HistoryRow = {
  id: string;
  leadId: string;
  campaignId: string | null;
  campaignName: string | null;
  companyName: string;
  statusAtVisit: string;
  currentStatus: string | null;
  visitedAt: string;
};

type Payload = {
  dayKey: string;
  todayKey: string;
  rows: HistoryRow[];
};

function statusLabel(status: string | null | undefined): string {
  const key = String(status ?? "").trim().toUpperCase();
  return LEAD_STATUS_LABELS[key as LeadStatus] ?? key ?? "—";
}

export default function HistorikPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const myUserId = session?.user?.id ?? "";

  const [dayKey, setDayKey] = useState(() => copenhagenDayKey());
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (myUserId && !selectedUserId) {
      setSelectedUserId(myUserId);
    }
  }, [myUserId, selectedUserId]);

  useEffect(() => {
    if (!isAdmin || sessionStatus !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/users/for-assignment");
      if (!res.ok || cancelled) return;
      const data = (await res.json().catch(() => [])) as UserOption[];
      if (!cancelled && Array.isArray(data)) {
        setUserOptions(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (isAdmin && !selectedUserId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ dayKey });
      if (isAdmin && selectedUserId) {
        params.set("userId", selectedUserId);
      }
      const res = await fetch(`/api/history?${params.toString()}`);
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Kunne ikke hente historik.");
        setRows([]);
        setLoading(false);
        return;
      }
      const payload = (await res.json()) as Payload;
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, isAdmin, selectedUserId, dayKey]);

  const selectedUserLabel =
    isAdmin && selectedUserId
      ? userOptions.find((u) => u.id === selectedUserId)?.name ?? null
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Historik</h1>
          <p className="mt-1 text-sm text-stone-600">
            {isAdmin && selectedUserId && selectedUserId !== myUserId ? (
              <>
                Historik for <strong>{selectedUserLabel ?? "valgt bruger"}</strong> — leads åbnet i
                arbejdskøen den valgte dag.
              </>
            ) : (
              <>
                Se hvilke leads du har været inde på i arbejdskøen, også når der ikke blev ændret
                udfald.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {isAdmin && userOptions.length > 0 && (
            <label className="text-sm text-stone-700">
              Bruger
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="mt-1 block w-full min-w-[12rem] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 sm:w-auto"
              >
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.username}){u.role === "ADMIN" ? " · Admin" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm text-stone-700">
            Dato
            <input
              type="date"
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
              className="mt-1 block rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            />
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Tidspunkt</th>
              <th className="px-4 py-3 font-medium">Virksomhed</th>
              <th className="px-4 py-3 font-medium">Kampagne</th>
              <th className="px-4 py-3 font-medium">Status ved åbning</th>
              <th className="px-4 py-3 font-medium">Status nu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                  Henter…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                  Ingen historik for den valgte dag.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const href = row.campaignId
                  ? `/kampagner/${encodeURIComponent(row.campaignId)}/arbejd?leadId=${encodeURIComponent(row.leadId)}`
                  : `/leads/${encodeURIComponent(row.leadId)}`;
                return (
                  <tr key={row.id} className="hover:bg-stone-50/80">
                    <td className="px-4 py-3 text-stone-700">
                      {new Date(row.visitedAt).toLocaleString("da-DK", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={href} className="font-medium text-stone-900 underline-offset-2 hover:underline">
                        {row.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{row.campaignName ?? "—"}</td>
                    <td className="px-4 py-3 text-stone-700">{statusLabel(row.statusAtVisit)}</td>
                    <td className="px-4 py-3 text-stone-700">{statusLabel(row.currentStatus)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
