"use client";

import { useState } from "react";

type BackfillStats = {
  scanned: number;
  matched: number;
  created: number;
  updated: number;
  copiedToBlob: number;
  uncoupled: number;
  errors: { recordingId: string; message: string }[];
};

type BackfillResponse = {
  ok?: boolean;
  dryRun?: boolean;
  copyToBlob?: boolean;
  pageSize?: number;
  startPage?: number;
  pagesProcessed?: number;
  nextPage?: number | null;
  totalPages?: number | null;
  stats?: BackfillStats;
  error?: string;
};

type CumulativeStats = BackfillStats & { invocations: number };

function emptyCumulative(): CumulativeStats {
  return {
    invocations: 0,
    scanned: 0,
    matched: 0,
    created: 0,
    updated: 0,
    copiedToBlob: 0,
    uncoupled: 0,
    errors: [],
  };
}

function mergeStats(prev: CumulativeStats, next: BackfillStats): CumulativeStats {
  return {
    invocations: prev.invocations + 1,
    scanned: prev.scanned + next.scanned,
    matched: prev.matched + next.matched,
    created: prev.created + next.created,
    updated: prev.updated + next.updated,
    copiedToBlob: prev.copiedToBlob + next.copiedToBlob,
    uncoupled: prev.uncoupled + next.uncoupled,
    errors: [...prev.errors, ...next.errors].slice(-50),
  };
}

export function TelnyxRecordingsBackfillPanel() {
  const [fromIso, setFromIso] = useState<string>("");
  const [toIso, setToIso] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(100);
  const [maxPages, setMaxPages] = useState<number>(5);
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [copyToBlob, setCopyToBlob] = useState<boolean>(true);
  const [autoContinue, setAutoContinue] = useState<boolean>(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cumulative, setCumulative] = useState<CumulativeStats>(emptyCumulative());
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);

  function reset() {
    setError(null);
    setCumulative(emptyCumulative());
    setNextPage(null);
    setTotalPages(null);
  }

  async function runOnce(startPage: number) {
    const body = {
      fromIso: fromIso ? new Date(fromIso).toISOString() : undefined,
      toIso: toIso ? new Date(toIso).toISOString() : undefined,
      startPage,
      pageSize,
      maxPages,
      dryRun,
      copyToBlob,
    };
    const res = await fetch("/api/admin/telnyx-recordings/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as BackfillResponse;
    if (!res.ok || !json.ok) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json;
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCumulative(emptyCumulative());
    setNextPage(null);
    setTotalPages(null);
    try {
      let page = 1;
      let runs = 0;
      // Sikkerhedsnet: maksimalt 50 sekvensielle kald (= 50 × maxPages × pageSize optagelser)
      while (runs < 50) {
        const out = await runOnce(page);
        runs += 1;
        if (out.stats) {
          setCumulative((prev) => mergeStats(prev, out.stats!));
        }
        if (typeof out.totalPages === "number") setTotalPages(out.totalPages);
        const np = out.nextPage ?? null;
        setNextPage(np);
        if (!np) break;
        if (!autoContinue) break;
        page = np;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function continueFromNext() {
    if (busy || !nextPage) return;
    setBusy(true);
    setError(null);
    try {
      let page = nextPage;
      let runs = 0;
      while (runs < 50) {
        const out = await runOnce(page);
        runs += 1;
        if (out.stats) {
          setCumulative((prev) => mergeStats(prev, out.stats!));
        }
        if (typeof out.totalPages === "number") setTotalPages(out.totalPages);
        const np = out.nextPage ?? null;
        setNextPage(np);
        if (!np) break;
        if (!autoContinue) break;
        page = np;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Backfill af tidligere optagelser</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Henter dine eksisterende optagelser fra Telnyx (<code>GET /v2/recordings</code>),
            kobler dem til det rigtige lead via <code>client_state</code> /{" "}
            <code>call_control_id</code> / <code>call_session_id</code> (eller præcist
            telefonnummermatch som sidste udvej), og lægger en kopi i Vercel Blob så
            afspilningen ikke afhænger af udløbende Telnyx-links. Hver optagelse
            registreres som en <strong>CALL_RECORDING</strong>-aktivitet under «Aktivitet»
            på det pågældende lead. Idempotent — kan køres igen uden dubletter.
          </p>
        </div>
      </header>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-700">
          Fra (lokal tid)
          <input
            type="datetime-local"
            value={fromIso}
            onChange={(e) => setFromIso(e.target.value)}
            className="rounded-md border border-stone-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-700">
          Til (lokal tid)
          <input
            type="datetime-local"
            value={toIso}
            onChange={(e) => setToIso(e.target.value)}
            className="rounded-md border border-stone-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-700">
          Sidestørrelse (1–250)
          <input
            type="number"
            min={1}
            max={250}
            value={pageSize}
            onChange={(e) => setPageSize(Math.max(1, Math.min(250, Number(e.target.value) || 100)))}
            className="rounded-md border border-stone-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-700">
          Sider pr. kald (1–10)
          <input
            type="number"
            min={1}
            max={10}
            value={maxPages}
            onChange={(e) => setMaxPages(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
            className="rounded-md border border-stone-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-stone-700">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={copyToBlob}
            onChange={(e) => setCopyToBlob(e.target.checked)}
          />
          Kopiér lydfil til Vercel Blob (anbefales)
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoContinue}
            onChange={(e) => setAutoContinue(e.target.checked)}
          />
          Fortsæt automatisk gennem alle sider
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Tør kørsel (ingen DB-skriv)
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy ? "Kører backfill…" : "Start backfill"}
        </button>
        {nextPage && !busy ? (
          <button
            type="button"
            onClick={() => void continueFromNext()}
            className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50"
          >
            Fortsæt fra side {nextPage}
          </button>
        ) : null}
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-60"
        >
          Nulstil
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Skannet" value={cumulative.scanned} />
        <Stat label="Knyttet til lead" value={cumulative.matched} />
        <Stat label="Oprettet" value={cumulative.created} />
        <Stat label="Opdateret" value={cumulative.updated} />
        <Stat label="Kopieret til Blob" value={cumulative.copiedToBlob} />
        <Stat label="Uden lead" value={cumulative.uncoupled} subtle />
      </div>

      <p className="mt-3 text-xs text-stone-500">
        {cumulative.invocations > 0
          ? `Kørsler: ${cumulative.invocations}${
              totalPages ? ` · ca. ${totalPages} sider hos Telnyx` : ""
            }${nextPage ? ` · næste side: ${nextPage}` : nextPage === null && cumulative.invocations > 0 ? " · alle sider gennemgået" : ""}`
          : "Endnu ingen kørsler i denne session."}
      </p>

      {cumulative.errors.length > 0 ? (
        <details className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <summary className="cursor-pointer text-sm font-semibold">
            Fejl pr. optagelse ({cumulative.errors.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {cumulative.errors.map((er, i) => (
              <li key={`${er.recordingId}-${i}`}>
                <code className="rounded bg-amber-100 px-1 py-0.5">{er.recordingId}</code>{" "}
                — {er.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Stat({ label, value, subtle }: { label: string; value: number; subtle?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        subtle ? "border-stone-200 bg-stone-50" : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${subtle ? "text-stone-500" : "text-emerald-700"}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-semibold ${subtle ? "text-stone-700" : "text-emerald-900"}`}>{value}</p>
    </div>
  );
}
