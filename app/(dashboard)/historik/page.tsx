"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { copenhagenDayKey } from "@/lib/copenhagen-day";

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
  const [dayKey, setDayKey] = useState(() => copenhagenDayKey());
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/history?dayKey=${encodeURIComponent(dayKey)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (!cancelled) {
          setError(typeof j.error === "string" ? j.error : "Kunne ikke hente historik.");
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const payload = (await res.json()) as Payload;
      if (!cancelled) {
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dayKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Historik</h1>
          <p className="mt-1 text-sm text-stone-600">
            Se hvilke leads du har været inde på i arbejdskøen, også når der ikke blev ændret udfald.
          </p>
        </div>
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Tidspunkt</th>
              <th className="px-4 py-3 font-medium">Virksomhed</th>
              <th className="px-4 py-3 font-medium">Kampagne</th>
              <th className="px-4 py-3 font-medium">Status da du åbnede</th>
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
