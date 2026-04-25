"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type TelnyxSection = {
  label: string;
  product: string;
  ok: boolean;
  costUsd?: number;
  rows?: Record<string, unknown>[];
  message?: string;
  status?: number;
  scopeNote?: string;
};

type CostPayload = {
  period: {
    label: string;
    year: number;
    month: number;
    startUtc: string;
    endExclusiveUtc: string;
  };
  allio: {
    outboundLeadLegs: number;
    leadCallsAnswered: number;
    leadBridgesCompleted: number;
    abandonNoAgent: number;
    amdVoicemailOrFax: number;
    outboundAgentBridgeLegs: number;
    callAttemptActivities: number;
    savedRecordingActivities: number;
    approximateBillableMinutesOutboundLead: number;
    uniqueCliNumbersUsed: number;
    /** Telnyx `webrtc` usage — sekunder, til sammenligning når DialerCallLog minutter = 0 */
    telnyxReportedWebrtcCallSec?: number;
  };
  meetings: { bookedInMonth: number };
  telnyx: {
    apiConfigured: boolean;
    allReportsOk: boolean;
    error: string | null;
    totalCostUsd: number;
    totalCostDkkApprox: number;
    costPerMeetingBookedDkkApprox: number | null;
    sections: TelnyxSection[];
  };
  disclaimer: string;
};

function formatUsd(n: number) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDkk(n: number) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Seneste 18 måneder ud fra browserens lokale kalender (typisk samme som DK). */
function monthOptions() {
  const out: { y: number; m: number; label: string }[] = [];
  const base = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const raw = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" }).format(d);
    out.push({ y, m, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
  }
  return out;
}

export default function TelnyxCostPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<CostPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "ADMIN") {
      router.replace("/leads");
    }
  }, [session, status, router]);

  const load = useCallback(async (y?: number, m?: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        typeof y === "number" && typeof m === "number"
          ? `?year=${encodeURIComponent(String(y))}&month=${encodeURIComponent(String(m))}`
          : "";
      const res = await fetch(`/api/admin/telnyx-cost${qs}`);
      const text = await res.text();
      let body: (CostPayload & { error?: string }) | null = null;
      try {
        body = text ? (JSON.parse(text) as CostPayload & { error?: string }) : null;
      } catch {
        setError(
          res.status === 504
            ? "Serveren nåede ikke at færdiggøre (ofte Telnyx-rapporten). Prøv igen om et øjeblik."
            : "Ugyldigt svar fra serveren. Prøv igen, eller tjek at deployment kører.",
        );
        setData(null);
        return;
      }
      if (!body) {
        setError("Kunne ikke hente data.");
        setData(null);
        return;
      }
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Kunne ikke hente data.");
        setData(null);
        return;
      }
      setData(body);
      setYear(body.period.year);
      setMonth(body.period.month);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error("[cost] load failed", err);
      setError("Netværksfejl.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "ADMIN") return;
    void load();
  }, [status, session?.user.role, load]);

  // Auto-opdater alle cost-tal hvert 20. minut.
  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "ADMIN") return;
    const id = window.setInterval(() => {
      const y = typeof year === "number" ? year : undefined;
      const m = typeof month === "number" ? month : undefined;
      void load(y, m);
    }, 20 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [status, session?.user.role, year, month, load]);

  const onApplyMonth = () => {
    if (typeof year === "number" && typeof month === "number") void load(year, month);
  };

  if (status === "loading" || !session || session.user.role !== "ADMIN") {
    return <p className="text-stone-500">Henter…</p>;
  }

  const opts = monthOptions();

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-16">
      <header className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 px-6 py-8 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-200/90">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cost & Telnyx</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-violet-100/90">
          Overblik over <strong>indeværende eller valgt måned</strong> (Europe/Copenhagen): hvad Allio har logget
          (opkald, abandons, møder) og hvad Telnyx rapporterer i dollars — så du kan sammenligne med bookede møder og
          groft ROI.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-violet-200/90">
            Måned
            <select
              className="mt-1 block min-w-[12rem] rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-violet-300"
              value={`${year}-${month}`}
              onChange={(e) => {
                const [yy, mm] = e.target.value.split("-").map(Number);
                setYear(yy);
                setMonth(mm);
              }}
            >
              {opts.map((o) => (
                <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`} className="bg-slate-900 text-white">
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => onApplyMonth()}
            disabled={loading || typeof year !== "number" || typeof month !== "number"}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-violet-950 shadow hover:bg-violet-50 disabled:opacity-50"
          >
            Opdatér
          </button>
          <Link
            href="https://portal.telnyx.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-violet-200 underline-offset-2 hover:text-white hover:underline"
          >
            Telnyx Mission Control →
          </Link>
          {lastUpdatedAt ? (
            <p className="text-xs text-violet-200/90">
              Sidst opdateret:{" "}
              {lastUpdatedAt.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {data?.telnyx.error && data.telnyx.apiConfigured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Telnyx: {data.telnyx.error}
        </p>
      ) : null}

      {loading && !data ? <p className="text-stone-500">Indlæser dashboard…</p> : null}

      {data && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase text-stone-500">Telnyx (måned)</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">{formatUsd(data.telnyx.totalCostUsd)}</p>
              <p className="mt-1 text-sm text-stone-600">ca. {formatDkk(data.telnyx.totalCostDkkApprox)}</p>
              {!data.telnyx.apiConfigured ? (
                <p className="mt-2 text-xs text-amber-700">Sæt TELNYX_API_KEY for live priser.</p>
              ) : !data.telnyx.allReportsOk ? (
                <p className="mt-2 text-xs text-amber-800">Dele af Telnyx‑API svarede ikke — se tabellen nedenfor.</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase text-stone-500">Møder booket</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-800">{data.meetings.bookedInMonth}</p>
              <p className="mt-1 text-sm text-stone-600">I samme kalendermåned (København)</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase text-stone-500">Omkostning / møde</p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {data.telnyx.costPerMeetingBookedDkkApprox !== null
                  ? formatDkk(data.telnyx.costPerMeetingBookedDkkApprox)
                  : "—"}
              </p>
              <p className="mt-1 text-sm text-stone-600">Vejledende DKK (Telnyx ca. ÷ møder)</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase text-stone-500">Forbrug minutter (lead)</p>
              <p className="mt-2 text-2xl font-semibold text-violet-900">
                {data.allio.approximateBillableMinutesOutboundLead}
              </p>
              <p className="mt-1 text-sm text-stone-600">Summen af (slut − start) pr. udgående lead‑leg</p>
              {(data.allio.telnyxReportedWebrtcCallSec ?? 0) > 0 ? (
                <p className="mt-2 text-xs leading-snug text-stone-500">
                  Telnyx (WebRTC, rapporteret): ca.{" "}
                  <strong>
                    {Math.round(((data.allio.telnyxReportedWebrtcCallSec ?? 0) / 60) * 10) / 10} min
                  </strong>{" "}
                  (talk‑time) — sammenlign hvis tallet til venstre er 0, typisk pga. WebRTC uden fuld
                  DialerCallLog.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">Allio — opkald & kvalitet</h2>
            <p className="mt-1 text-sm text-stone-600">
              Tællere fra <code className="rounded bg-stone-100 px-1 text-xs">DialerCallLog</code> og{" "}
              <code className="rounded bg-stone-100 px-1 text-xs">LeadActivityEvent</code> i perioden{" "}
              <strong>{data.period.label}</strong>. WebRTC klik-til-kald får nu et <code>CALL_ATTEMPT</code> (ligesom
              Call Control) i aktivitet, så &quot;Opkald forsøg&quot; følger faktisk brug. Dispatch-/bridge-legs
              tælles fortsat i <code className="rounded bg-stone-100 px-1 text-xs">DialerCallLog</code>.
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">Udgående lead‑opkald (legs)</dt>
                <dd className="mt-1 text-xl font-semibold text-stone-900">{data.allio.outboundLeadLegs}</dd>
              </div>
              <div className="rounded-lg bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">Besvarede lead‑opkald</dt>
                <dd className="mt-1 text-xl font-semibold text-stone-900">{data.allio.leadCallsAnswered}</dd>
              </div>
              <div className="rounded-lg bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-100">
                <dt className="text-xs font-medium text-emerald-800">Bridgede samtaler (lead → agent)</dt>
                <dd className="mt-1 text-xl font-semibold text-emerald-950">{data.allio.leadBridgesCompleted}</dd>
              </div>
              <div className="rounded-lg bg-amber-50/80 px-4 py-3 ring-1 ring-amber-100">
                <dt className="text-xs font-medium text-amber-900">Abandon (ingen ledig agent)</dt>
                <dd className="mt-1 text-xl font-semibold text-amber-950">{data.allio.abandonNoAgent}</dd>
              </div>
              <div className="rounded-lg bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">Voicemail / fax (AMD)</dt>
                <dd className="mt-1 text-xl font-semibold text-stone-900">{data.allio.amdVoicemailOrFax}</dd>
              </div>
              <div className="rounded-lg bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">Agent‑bridge legs (ud til SIP)</dt>
                <dd className="mt-1 text-xl font-semibold text-stone-900">{data.allio.outboundAgentBridgeLegs}</dd>
              </div>
              <div className="rounded-lg bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">Opkald forsøg (aktivitet)</dt>
                <dd className="mt-1 text-xl font-semibold text-stone-900">{data.allio.callAttemptActivities}</dd>
              </div>
              <div className="rounded-lg bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">Gemte optagelser (aktivitet)</dt>
                <dd className="mt-1 text-xl font-semibold text-stone-900">{data.allio.savedRecordingActivities}</dd>
              </div>
              <div className="rounded-lg bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">Unikke CLI‑numre brugt</dt>
                <dd className="mt-1 text-xl font-semibold text-stone-900">{data.allio.uniqueCliNumbersUsed}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">Telnyx — rapporteret forbrug & pris</h2>
            <p className="mt-1 text-sm text-stone-600">
              Data fra Telnyx Usage Reports pr. produkt (Voice API filtreret på jeres{" "}
              <code className="rounded bg-stone-100 px-1 text-xs">TELNYX_CONNECTION_ID</code>, hvis sat).
            </p>
            <div className="mt-6 space-y-6">
              {data.telnyx.sections.length === 0 ? (
                <p className="text-sm text-stone-600">
                  Ingen Telnyx‑rapporter hentet. Tjek at <code className="rounded bg-stone-100 px-1">TELNYX_API_KEY</code>{" "}
                  er sat, og at din Telnyx‑konto har adgang til Usage Reports.
                </p>
              ) : null}
              {data.telnyx.sections.map((sec) => (
                <div key={sec.product} className="rounded-xl border border-stone-100 bg-stone-50/60 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-stone-900">{sec.label}</h3>
                    {sec.ok && typeof sec.costUsd === "number" ? (
                      <p className="text-sm font-semibold text-violet-900">{formatUsd(sec.costUsd)}</p>
                    ) : (
                      <p className="text-xs font-medium text-red-700">
                        Fejl{sec.status ? ` ${sec.status}` : ""}: {sec.message ?? "Ukendt"}
                      </p>
                    )}
                  </div>
                  {sec.ok && sec.scopeNote ? (
                    <p className="mt-2 text-xs text-amber-800">{sec.scopeNote}</p>
                  ) : null}
                  {sec.ok && sec.rows && sec.rows.length > 0 ? (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 bg-white">
                      <table className="min-w-full text-left text-xs text-stone-700">
                        <thead className="bg-stone-100/80 text-[0.65rem] font-semibold uppercase text-stone-500">
                          <tr>
                            {Object.keys(sec.rows[0])
                              .filter((k) => k !== "product")
                              .map((k) => (
                                <th key={k} className="whitespace-nowrap px-3 py-2">
                                  {k.replace(/_/g, " ")}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sec.rows.slice(0, 25).map((row, ri) => (
                            <tr key={ri} className="border-t border-stone-100">
                              {Object.entries(row)
                                .filter(([k]) => k !== "product")
                                .map(([k, v]) => (
                                  <td key={k} className="whitespace-nowrap px-3 py-2 font-mono text-[0.7rem]">
                                    {typeof v === "number"
                                      ? k === "cost"
                                        ? formatUsd(v)
                                        : Number.isInteger(v)
                                          ? String(v)
                                          : String(Math.round(v * 1000) / 1000)
                                      : v === null || v === undefined
                                        ? "—"
                                        : String(v)}
                                  </td>
                                ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : sec.ok ? (
                    <p className="mt-2 text-xs text-stone-500">Ingen rækker i denne periode.</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <p className="text-center text-xs leading-relaxed text-stone-500">{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}
