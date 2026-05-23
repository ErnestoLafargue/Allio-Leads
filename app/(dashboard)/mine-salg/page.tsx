"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  meetingOutcomeBadgeClass,
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";
import { COMMISSION_REBOOKING_FLAT_KR, rateKrPerHeldMeeting } from "@/lib/commission";
import { DashboardTabs } from "@/app/components/dashboard-tabs";
import { buildLeadDetailHref, KNOWN_LEAD_SOURCES } from "@/lib/lead-navigation";
import { UserViewSwitcher } from "./_components/user-view-switcher";

type UserOption = { id: string; name: string; username: string; role?: string };

type LeadRow = {
  id: string;
  leadId?: string;
  companyName: string;
  meetingScheduledFor: string | null;
  meetingBookedAt: string | null;
  meetingOutcomeStatus?: string;
  meetingCommissionDayKey?: string;
  archived?: boolean;
  campaign?: { name: string };
};

type DaySummary = {
  dayKey: string;
  finalized: boolean;
  heldCount: number;
  heldRebookingCount?: number;
  heldStandardCount?: number;
  cancelledCount: number;
  pendingCount: number;
  kr: number;
  ratePerHeld: number;
  rateLabel?: string | null;
  meetingCount: number;
  possibleHeldCount?: number;
  possibleRebookingCount?: number;
  possibleStandardCount?: number;
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
    rebook?: number;
    sale: number;
    cancelled: number;
  };
  viewingUser?: { id: string; name: string; username: string };
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
  const { data: session, status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isAdmin = session?.user?.role === "ADMIN";
  const myUserId = session?.user?.id ?? "";

  const urlUserId = searchParams.get("userId")?.trim() ?? "";
  const effectiveUserId = isAdmin ? urlUserId || myUserId : myUserId;

  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [data, setData] = useState<SalesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || sessionStatus !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/users/for-mine-salg-view");
      if (!res.ok || cancelled) return;
      const list = (await res.json().catch(() => [])) as UserOption[];
      if (!cancelled && Array.isArray(list)) {
        setUserOptions(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, sessionStatus]);

  const load = useCallback(async () => {
    if (sessionStatus === "loading" || !myUserId) return;
    if (isAdmin && !effectiveUserId) return;

    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (isAdmin && effectiveUserId) {
      params.set("userId", effectiveUserId);
    }
    const qs = params.toString();
    const res = await fetch(`/api/me/sales${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente data");
      setLoading(false);
      return;
    }
    const payload = (await res.json()) as SalesPayload;
    setData(payload);
    setLoading(false);
  }, [sessionStatus, myUserId, isAdmin, effectiveUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleUserChange(nextId: string) {
    if (!isAdmin || !nextId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("userId", nextId);
    router.replace(`/mine-salg?${params.toString()}`);
  }

  const viewingName = useMemo(() => {
    if (data?.viewingUser?.name) return data.viewingUser.name;
    const fromList = userOptions.find((u) => u.id === effectiveUserId);
    if (fromList?.name) return fromList.name;
    if (effectiveUserId === myUserId) return session?.user?.name ?? "Dig";
    return "Bruger";
  }, [data?.viewingUser?.name, userOptions, effectiveUserId, myUserId, session?.user?.name]);

  const viewingOtherUser = isAdmin && effectiveUserId !== myUserId;

  if (sessionStatus === "loading") {
    return (
      <div className="space-y-6">
        <DashboardTabs />
        <div className="text-center text-stone-500">Henter session…</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <DashboardTabs />
        <div className="text-center text-stone-500">Henter…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <DashboardTabs />
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <DashboardTabs />
        <p className="text-sm text-stone-500">Ingen data</p>
      </div>
    );
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
      <DashboardTabs />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Mine Salg</h1>
          <p className="mt-1 text-sm text-stone-600">
            {viewingOtherUser ? (
              <>
                Oversigt over møder booket af <strong>{viewingName}</strong>, deres status og provision der
                løbende kan udbetales for afholdte møder.
              </>
            ) : (
              <>
                Oversigt over de møder du har booket, deres status og provision der løbende kan udbetales
                for afholdte møder.
              </>
            )}
          </p>
        </div>
        {isAdmin && userOptions.length > 0 && (
          <UserViewSwitcher
            value={effectiveUserId}
            displayName={viewingName}
            options={userOptions}
            myUserId={myUserId}
            disabled={loading}
            onChange={handleUserChange}
          />
        )}
      </div>

      {loading && (
        <p className="text-sm text-stone-500" role="status">
          Opdaterer data…
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-900/80">Genbook</p>
          <p className="mt-1 text-2xl font-semibold text-sky-950">{stats.rebook ?? 0}</p>
        </div>
        <div className="rounded-xl border border-red-200/80 bg-red-50/40 p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-red-900/80">Ej mødt</p>
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
          <p className="mt-2 text-xs text-sky-900/85">
            Hvis alle ikke-annullerede møder går igennem, udbetales der.
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900">Bonus-trappe (pr. afholdt møde)</h2>
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            <li>
              Møder booket fra <strong>genbooking-kampagnen</strong> → {COMMISSION_REBOOKING_FLAT_KR} kr pr.
              afholdt (tæller ikke med i trappen).
            </li>
            <li>1 afholdt møde samme dag (øvrige) → {rateKrPerHeldMeeting(1)} kr pr. afholdt</li>
            <li>2 afholdt samme dag (øvrige) → {rateKrPerHeldMeeting(2)} kr pr. afholdt</li>
            <li>3 eller flere afholdt samme dag (øvrige) → {rateKrPerHeldMeeting(3)} kr pr. afholdt</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-blue-950 shadow-sm">
        <h2 className="font-semibold text-blue-950">Sådan fungerer provisionen</h2>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-blue-900/90">
          <li>Provision regnes pr. <strong>kalenderdag</strong>, som du har booket møder på (bookings-dato).</li>
          <li>
            Når <strong>alle</strong> møder fra den dag er registreret som enten afholdt, genbook eller ej mødt, kan dagen
            afregnes.
          </li>
          <li>
            Satsen pr. afholdt møde afhænger af, hvor mange møder der reelt blev <strong>afholdt</strong> den dag —
            annullerede møder tæller ikke med i antallet, men skal stadig have udfald før dagen kan lukkes. Møder
            booket fra genbooking giver fast {COMMISSION_REBOOKING_FLAT_KR} kr og indgår ikke i bonustrappen.
          </li>
          <li>
            <strong>Forventet provision</strong> regnes kun på møder, der stadig kan blive afholdt — annullerede møder
            tæller ikke med i muligt bonus-trin.
          </li>
          <li>
            <strong>Forventet provision</strong>: hvis alle ikke-annullerede møder går igennem, udbetales der.
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
                      {d.heldCount > 0 ? (d.rateLabel ?? `${d.ratePerHeld} kr`) : "—"}
                    </td>
                    <td className="px-3 py-2 text-sky-900">
                      {d.meetingCount > 0 ? (
                        <>
                          <span className="font-medium">
                            {(d.forventetKr ?? 0).toLocaleString("da-DK")} kr
                          </span>
                          <span className="mt-0.5 block text-xs text-stone-500">
                            {(d.possibleRebookingCount ?? 0) > 0 || (d.possibleStandardCount ?? 0) > 0 ? (
                              <>
                                {(d.possibleRebookingCount ?? 0) > 0 && (
                                  <span>
                                    {COMMISSION_REBOOKING_FLAT_KR} kr × {d.possibleRebookingCount} (genbooking)
                                    {(d.possibleStandardCount ?? 0) > 0 ? " · " : ""}
                                  </span>
                                )}
                                {(d.possibleStandardCount ?? 0) > 0 && (
                                  <span>
                                    {(d.forventetRatePerMeeting ?? 0)} kr × {d.possibleStandardCount} (øvrige)
                                  </span>
                                )}
                              </>
                            ) : (
                              <>0 kr × 0</>
                            )}
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
        <h2 className="text-sm font-semibold text-stone-900">
          {viewingOtherUser ? `Bookede møder (${viewingName})` : "Dine bookede møder"}
        </h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr>
                <th className="px-3 py-2 font-medium">Virksomhed</th>
                <th className="px-3 py-2 font-medium">Møde tid</th>
                <th className="px-3 py-2 font-medium">Booket</th>
                <th className="px-3 py-2 font-medium">Kampagne</th>
                <th className="px-3 py-2 font-medium">Udfald</th>
                <th className="px-3 py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                    {viewingOtherUser ? "Ingen bookede møder for denne bruger." : "Du har ikke booket møder endnu."}
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={buildLeadDetailHref(l.leadId ?? l.id, KNOWN_LEAD_SOURCES.mineSalg)}
                        className="font-medium text-stone-900 hover:underline"
                      >
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
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meetingOutcomeBadgeClass(l.meetingOutcomeStatus)}`}
                      >
                        {outcomeLabel(l.meetingOutcomeStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {l.archived ? (
                        <span className="inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                          Tidligere møde
                        </span>
                      ) : (
                        "Aktuelt"
                      )}
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
