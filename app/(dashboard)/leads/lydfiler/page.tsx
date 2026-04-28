"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardTabs } from "@/app/components/dashboard-tabs";
import { LeadRecordingPlayer } from "@/app/components/lead-recording-player";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";

type Row = {
  id: string;
  at: string;
  durationSeconds: number | null;
  recordingUrl: string | null;
  summary: string;
  agent: { id: string; name: string } | null;
  lead: {
    id: string;
    companyName: string;
    phone: string;
    status: string;
    statusLabel: string;
  };
};

type SortKey = "time" | "company" | "status" | "agent";

export default function LydfilerPage() {
  const [qDraft, setQDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<string>("");
  const [committedQ, setCommittedQ] = useState("");
  const [committedStatus, setCommittedStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("time");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ items: Row[]; total: number; totalPages: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("pageSize", "40");
    sp.set("sort", sort);
    sp.set("dir", dir);
    if (committedQ.trim()) sp.set("q", committedQ.trim());
    if (committedStatus) sp.set("status", committedStatus);
    const res = await fetch(`/api/leads/call-recordings?${sp.toString()}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente lydfiler.");
      setData(null);
      setLoading(false);
      return;
    }
    setData({
      items: Array.isArray(j.items) ? j.items : [],
      total: typeof j.total === "number" ? j.total : 0,
      totalPages: typeof j.totalPages === "number" ? j.totalPages : 1,
    });
    setLoading(false);
  }, [page, sort, dir, committedQ, committedStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSort(next: SortKey) {
    if (sort === next) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(next);
      setDir(next === "time" ? "desc" : "asc");
    }
    setPage(1);
  }

  function applyFilters() {
    setCommittedQ(qDraft);
    setCommittedStatus(statusDraft);
    setPage(1);
  }

  const sortHint = (key: SortKey) => (sort === key ? (dir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="space-y-6">
      <DashboardTabs />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Lydfiler</h1>
          <p className="text-sm text-stone-500">
            Alle opkaldsoptagelser med kunde, lead, tidspunkt og leadets nuværende udfald. Klik på kolonnetitler for at
            sortere.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs font-medium text-stone-600">
            Søg
            <input
              type="search"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="Virksomhed eller telefon…"
              className="w-52 rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-medium text-stone-600">
            Udfald
            <select
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
              className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            >
              <option value="">Alle</option>
              {(LEAD_STATUSES as readonly LeadStatus[]).map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => applyFilters()}
            className="rounded-md bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-900"
          >
            Anvend
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-600">
              <th className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSort("time")}
                  className="font-semibold text-stone-700 hover:text-stone-900"
                >
                  Tid{sortHint("time")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSort("company")}
                  className="font-semibold text-stone-700 hover:text-stone-900"
                >
                  Kunde / lead{sortHint("company")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSort("status")}
                  className="font-semibold text-stone-700 hover:text-stone-900"
                >
                  Udfald{sortHint("status")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSort("agent")}
                  className="font-semibold text-stone-700 hover:text-stone-900"
                >
                  Agent{sortHint("agent")}
                </button>
              </th>
              <th className="px-3 py-2">Optagelse</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-stone-500">
                  Henter…
                </td>
              </tr>
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-stone-500">
                  Ingen lydfiler fundet med de valgte filtre.
                </td>
              </tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="border-b border-stone-100 align-top hover:bg-stone-50/80">
                  <td className="whitespace-nowrap px-3 py-3 text-stone-700">
                    {new Date(r.at).toLocaleString("da-DK", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/leads/${encodeURIComponent(r.lead.id)}`}
                      className="font-medium text-emerald-800 hover:underline"
                    >
                      {r.lead.companyName || "—"}
                    </Link>
                    <p className="text-xs text-stone-500">{r.lead.phone || "—"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-800">
                      {r.lead.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-stone-700">{r.agent?.name ?? "—"}</td>
                  <td className="min-w-[220px] px-3 py-3">
                    {r.recordingUrl ? (
                      <LeadRecordingPlayer
                        src={r.recordingUrl}
                        durationSecondsHint={r.durationSeconds}
                        variant="adminInline"
                      />
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
          <span>
            Side {page} af {data.totalPages} ({data.total} i alt)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-stone-200 bg-white px-3 py-1.5 font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              Forrige
            </button>
            <button
              type="button"
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-stone-200 bg-white px-3 py-1.5 font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              Næste
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
