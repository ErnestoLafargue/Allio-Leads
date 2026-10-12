"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EXPORTABLE_OUTCOME_OPTIONS,
  type ExportableOutcomeStatus,
} from "@/lib/data-export/leads-by-outcome";

type CampaignOption = { id: string; name: string };

export default function ExportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedStatuses, setSelectedStatuses] = useState<ExportableOutcomeStatus[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = session?.user.role === "ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isAdmin) {
      router.replace("/leads");
    }
  }, [session, status, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/campaigns");
        if (!res.ok) return;
        const data = (await res.json()) as { id?: string; name?: string }[];
        if (cancelled || !Array.isArray(data)) return;
        setCampaigns(
          data
            .filter((c) => typeof c.id === "string" && typeof c.name === "string")
            .map((c) => ({ id: c.id!, name: c.name! }))
            .sort((a, b) => a.name.localeCompare(b.name, "da")),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const queryString = useMemo(() => {
    if (selectedStatuses.length === 0) return null;
    const params = new URLSearchParams();
    params.set("status", selectedStatuses.join(","));
    if (selectedCampaignIds.length > 0) {
      params.set("campaignId", selectedCampaignIds.join(","));
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [selectedStatuses, selectedCampaignIds, from, to]);

  const refreshCount = useCallback(async () => {
    if (!queryString) {
      setMatchCount(null);
      return;
    }
    setCountLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/export/leads?${queryString}&countOnly=1`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMatchCount(null);
        setError(typeof data.error === "string" ? data.error : "Kunne ikke hente antal");
        return;
      }
      setMatchCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      setMatchCount(null);
      setError("Kunne ikke hente antal");
    } finally {
      setCountLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  function toggleStatus(statusCode: ExportableOutcomeStatus) {
    setSelectedStatuses((prev) =>
      prev.includes(statusCode)
        ? prev.filter((s) => s !== statusCode)
        : [...prev, statusCode],
    );
    setMessage(null);
  }

  function toggleCampaign(id: string) {
    setSelectedCampaignIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
    setMessage(null);
  }

  async function onDownload() {
    if (!queryString || exporting) return;
    setExporting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/export/leads?${queryString}&format=${format}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Eksport fejlede");
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      let filename = `udfald-export.${format}`;
      const star = /filename\*=UTF-8''([^;]+)/i.exec(disp);
      const quoted = /filename="([^"]+)"/i.exec(disp);
      if (star?.[1]) filename = decodeURIComponent(star[1]);
      else if (quoted?.[1]) filename = quoted[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const rowHeader = res.headers.get("X-Export-Row-Count");
      const n = rowHeader ? Number(rowHeader) : matchCount;
      setMessage(
        Number.isFinite(n) ? `Filen er hentet (${n} leads).` : "Filen er hentet.",
      );
    } catch {
      setError("Eksport fejlede");
    } finally {
      setExporting(false);
    }
  }

  if (status === "loading") {
    return <p className="text-stone-500">Henter…</p>;
  }

  if (!isAdmin) {
    return null;
  }

  const canDownload = selectedStatuses.length > 0 && !exporting;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Export</h1>
        <p className="mt-1 text-sm text-stone-600">
          Træk leads ud efter historisk udfald — alle der mindst én gang har fået det valgte udfald
          gemt, også hvis de senere er flyttet til genbooking eller har et andet nuværende udfald.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">Udfald (historisk)</h3>
          <p className="mt-1 text-xs text-stone-500">
            Vælg mindst ét. Matcher udfaldsloggen — ikke kun nuværende status. Soft udfald
            (voicemail, ikke hjemme, callback) kan ikke eksporteres her.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {EXPORTABLE_OUTCOME_OPTIONS.map((o) => {
              const checked = selectedStatuses.includes(o.status);
              return (
                <label
                  key={o.status}
                  className={[
                    "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    checked
                      ? "border-stone-800 bg-stone-900 text-white"
                      : "border-stone-200 bg-white text-stone-800 hover:bg-stone-50",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleStatus(o.status)}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
          {selectedStatuses.includes("MEETING_BOOKED") && (
            <p className="mt-2 text-xs text-stone-500">
              «Møde booket» finder alle der har sagt ja til møde mindst én gang — også hvis de
              nu ligger under ikke interesseret, ukvalificeret eller genbooking. Mødeudfald
              (afventende, salg, tabt, genbooking m.m.) medfølger.
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-stone-900">Kampagne (valgfri)</h3>
          <p className="mt-1 text-xs text-stone-500">
            Lad være tom for alle kampagner. Matcher nuværende kampagne eller besøgshistorik på
            kampagnen (så leads der er flyttet til kommende møder stadig findes).
          </p>
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-md border border-stone-200 p-2">
            {campaigns.length === 0 ? (
              <p className="px-1 py-2 text-xs text-stone-500">Ingen kampagner fundet.</p>
            ) : (
              campaigns.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-stone-800 hover:bg-stone-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedCampaignIds.includes(c.id)}
                    onChange={() => toggleCampaign(c.id)}
                    className="rounded border-stone-300"
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))
            )}
          </div>
          {selectedCampaignIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedCampaignIds([])}
              className="mt-2 text-xs text-stone-600 underline hover:text-stone-900"
            >
              Ryd kampagnefilter
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-stone-800">Fra dato (valgfri)</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setMessage(null);
              }}
              className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm outline-none ring-stone-400 focus:ring-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-stone-800">Til dato (valgfri)</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setMessage(null);
              }}
              className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm outline-none ring-stone-400 focus:ring-2"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-stone-700">
            {selectedStatuses.length === 0 ? (
              <>Vælg mindst ét udfald for at se antal matches.</>
            ) : countLoading ? (
              <>Tæller matches…</>
            ) : (
              <>
                <span className="font-semibold text-stone-900">{matchCount ?? "—"}</span> leads
                matcher dit valg
              </>
            )}
          </p>
          {error && (
            <p className="mt-1 text-xs text-red-700" role="alert">
              {error}
            </p>
          )}
          {message && !error && (
            <p className="mt-1 text-xs text-stone-600" role="status">
              {message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-stone-700">
            <span className="sr-only">Filformat</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "xlsx" | "csv")}
              disabled={exporting}
              className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:opacity-60"
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={!canDownload}
            className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? "Eksporterer…" : "Download"}
          </button>
        </div>
      </section>
    </div>
  );
}
