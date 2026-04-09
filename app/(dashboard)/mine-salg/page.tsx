"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";
import { rateKrPerHeldMeeting } from "@/lib/commission";

type LeadRow = {
  id: string;
  companyName: string;
  meetingScheduledFor: string | null;
  meetingBookedAt: string | null;
  meetingOutcomeStatus?: string;
  meetingCommissionDayKey?: string;
  campaign?: { name: string };
};

type DaySummary = {
  dayKey: string;
  finalized: boolean;
  heldCount: number;
  cancelledCount: number;
  pendingCount: number;
  kr: number;
  ratePerHeld: number;
  meetingCount: number;
  forventetKr?: number;
  forventetRatePerMeeting?: number;
};

type SalesPayload = {
  leads: LeadRow[];
  daySummaries: DaySummary[];
  tilUdbetalingKr: number;
  forventetProvisionKr?: number;
  stats: {
    totalBooked: number;
    pending: number;
    held: number;
    sale: number;
    cancelled: number;
  };
};

function formatDayKeyDa(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return dayKey;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}

function outcomeLabel(raw?: string) {
  const k = String(raw ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
  return MEETING_OUTCOME_LABELS[k] ?? MEETING_OUTCOME_LABELS[MEETING_OUTCOME_PENDING];
}

export default function MineSalgPage() {
  const [data, setData] = useState<SalesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch("/api/me/sales");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (!cancelled) {
          setError(typeof j.error === "string" ? j.error : "Kunne ikke hente data");
          setLoading(false);
        }
        return;
      }
      const payload = (await res.json()) as SalesPayload;
      if (!cancelled) {
        setData(payload);
        setError(null);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="text-center text-stone-500">Henter…</div>;
  }

  if (error || !data) {
    return <p className="text-sm text-red-600">{error ?? "Ingen data"}</p>;
  }

  const {
    leads,
    daySummaries,
    tilUdbetalingKr,
    forventetProvisionKr: forventetProvisionTotal = 0,
    stats,
  } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Mine Salg</h1>
        <p className="mt-1 text-sm text-stone-600">
          Oversigt over de møder du har booket, deres status og provision der løbende kan udbetales for afholdte
          møder.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Bookede møder i alt</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">{stats.totalBooked}</p>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-900/80">Afventende udfald</p>
          <p className="mt-1 text-2xl font-semibold text-amber-950">{stats.pending}</p>
        </div>
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-900/80">Afholdt</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-950">{stats.held}</p>
        </div>
        <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-900/80">Salg</p>
          <p className="mt-1 text-2xl font-semibold text-violet-950">{stats.sale ?? 0}</p>
        </div>
        <div className="rounded-xl border border-red-200/80 bg-red-50/40 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-red-900/80">Annulleret</p>
          <p className="mt-1 text-2xl font-semibold text-red-950">{stats.cancelled}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-emerald-950">Til udbetaling</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-900">
            {tilUdbetalingKr.toLocaleString("da-DK")} kr
          </p>
          <p className="mt-2 text-xs text-emerald-900/80">Hvad der bliver udbetalt for afholdte møder.</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-sky-950">Forventet provision</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-sky-900">
            {forventetProvisionTotal.toLocaleString("da-DK")} kr
          </p>
          <p className="mt-2 text-xs text-sky-900/85">Hvis alle møder går igennem, udbetales der.</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900">Bonus-trappe (pr. afholdt møde)</h2>
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            <li>1 afholdt møde samme dag → {rateKrPerHeldMeeting(1)} kr pr. afholdt</li>
            <li>2 afholdt samme dag → {rateKrPerHeldMeeting(2)} kr pr. afholdt</li>
            <li>3 eller flere afholdt samme dag → {rateKrPerHeldMeeting(3)} kr pr. afholdt</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-blue-950 shadow-sm">
        <h2 className="font-semibold text-blue-950">Sådan fungerer provisionen</h2>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-blue-900/90">
          <li>Provision regnes pr. <strong>kalenderdag</strong>, som du har booket møder på (bookings-dato).</li>
          <li>
            Når <strong>alle</strong> møder fra den dag er registreret som enten afholdt eller annulleret, kan dagen
            afregnes.
          </li>
          <li>
            Satsen pr. afholdt møde afhænger af, hvor mange møder der reelt blev <strong>afholdt</strong> den dag —
            annullerede møder tæller ikke med i antallet, men skal stadig have udfald før dagen kan lukkes.
          </li>
          <li>
            Før alle udfald er sat, vises der ikke beløb i «Til udbetaling» for den dag — det gør der først, når den
            sidste booking fra dagen har fået status.
          </li>
          <li>
            <strong>Forventet provision</strong>: hvis alle møder går igennem, udbetales der.
          </li>
        </ul>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-stone-900">Afregning pr. bookingsdag</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr>
                <th className="px-3 py-2 font-medium">Bookingsdag</th>
                <th className="px-3 py-2 font-medium">Møder</th>
                <th className="px-3 py-2 font-medium">Afholdt / annull. / afventer</th>
                <th className="px-3 py-2 font-medium">Sats (pr. afholdt)</th>
                <th className="px-3 py-2 font-medium">Forventet provision</th>
                <th className="px-3 py-2 font-medium">Til udbetaling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {daySummaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                    Ingen møder endnu.
                  </td>
                </tr>
              ) : (
                daySummaries.map((d) => (
                  <tr key={d.dayKey}>
                    <td className="px-3 py-2 text-stone-800">{formatDayKeyDa(d.dayKey)}</td>
                    <td className="px-3 py-2 text-stone-700">{d.meetingCount}</td>
                    <td className="px-3 py-2 text-stone-700">
                      {d.heldCount} / {d.cancelledCount} / {d.pendingCount}
                    </td>
                    <td className="px-3 py-2 text-stone-700">
                      {d.heldCount > 0 ? `${d.ratePerHeld} kr` : "—"}
                    </td>
                    <td className="px-3 py-2 text-sky-900">
                      {d.meetingCount > 0 ? (
                        <>
                          <span className="font-medium">
                            {(d.forventetKr ?? 0).toLocaleString("da-DK")} kr
                          </span>
                          <span className="mt-0.5 block text-xs text-stone-500">
                            {(d.forventetRatePerMeeting ?? 0)} kr × {d.meetingCount} (alle afholdt)
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-stone-900">
                      {d.kr > 0 ? `${d.kr.toLocaleString("da-DK")} kr` : "0 kr"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-stone-900">Dine bookede møder</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr>
                <th className="px-3 py-2 font-medium">Virksomhed</th>
                <th className="px-3 py-2 font-medium">Møde tid</th>
                <th className="px-3 py-2 font-medium">Booket</th>
                <th className="px-3 py-2 font-medium">Kampagne</th>
                <th className="px-3 py-2 font-medium">Udfald</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-stone-500">
                    Du har ikke booket møder endnu.
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">
                      <Link href={`/leads/${l.id}`} className="font-medium text-stone-900 hover:underline">
                        {l.companyName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-stone-700">
                      {l.meetingScheduledFor
                        ? new Date(l.meetingScheduledFor).toLocaleString("da-DK")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {l.meetingBookedAt ? new Date(l.meetingBookedAt).toLocaleString("da-DK") : "—"}
                    </td>
                    <td className="px-3 py-2 text-stone-600">{l.campaign?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          String(l.meetingOutcomeStatus).toUpperCase() === "HELD"
                            ? "bg-emerald-100 text-emerald-900"
                            : String(l.meetingOutcomeStatus).toUpperCase() === "CANCELLED"
                              ? "bg-red-100 text-red-900"
                              : String(l.meetingOutcomeStatus).toUpperCase() === MEETING_OUTCOME_SALE
                                ? "bg-violet-100 text-violet-950"
                                : "bg-amber-100 text-amber-950"
                        }`}
                      >
                        {outcomeLabel(l.meetingOutcomeStatus)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
