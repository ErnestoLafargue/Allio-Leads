"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  meetingOutcomeBadgeClass,
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
} from "@/lib/meeting-outcome";
import { DashboardTabs } from "@/app/components/dashboard-tabs";
import { buildLeadDetailHref, KNOWN_LEAD_SOURCES } from "@/lib/lead-navigation";
import { MeetingCountdown } from "./_components/meeting-countdown";
import { UserViewSwitcher } from "./_components/user-view-switcher";

type UserOption = { id: string; name: string; username: string; role?: string };

type LeadRow = {
  id: string;
  leadId?: string;
  companyName: string;
  meetingContactName?: string;
  meetingScheduledFor: string | null;
  meetingBookedAt: string | null;
  meetingOutcomeStatus?: string;
  archived?: boolean;
  campaign?: { name: string };
};

type SalesPayload = {
  leads: LeadRow[];
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

function outcomeLabel(raw?: string) {
  const k = String(raw ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
  return MEETING_OUTCOME_LABELS[k] ?? MEETING_OUTCOME_LABELS[MEETING_OUTCOME_PENDING];
}

function isPendingOutcome(raw?: string) {
  const k = String(raw ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
  return k === MEETING_OUTCOME_PENDING;
}

function isCancelledOutcome(raw?: string) {
  return String(raw ?? "").trim().toUpperCase() === MEETING_OUTCOME_CANCELLED;
}

function formatDaDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const upcomingMeetings = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    const overdueCutoff = now - 7 * 24 * 60 * 60 * 1000;
    return data.leads
      .filter((l) => {
        if (l.archived || !l.meetingScheduledFor) return false;
        const pending = isPendingOutcome(l.meetingOutcomeStatus);
        const cancelled = isCancelledOutcome(l.meetingOutcomeStatus);
        if (!pending && !cancelled) return false;
        // Vis også møder op til 7 dage efter mødedato, så bookeren kan følge op på afholdt/genbook/ej mødt.
        return new Date(l.meetingScheduledFor).getTime() >= overdueCutoff;
      })
      .sort(
        (a, b) =>
          Math.abs(new Date(a.meetingScheduledFor!).getTime() - now) -
          Math.abs(new Date(b.meetingScheduledFor!).getTime() - now),
      );
  }, [data]);

  const allMeetings = useMemo(() => {
    if (!data) return [];
    return [...data.leads].sort((a, b) => {
      const ta = a.meetingScheduledFor ? new Date(a.meetingScheduledFor).getTime() : 0;
      const tb = b.meetingScheduledFor ? new Date(b.meetingScheduledFor).getTime() : 0;
      return tb - ta;
    });
  }, [data]);

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

  const { stats } = data;

  return (
    <div className="space-y-8">
      <DashboardTabs />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Mine Salg</h1>
          <p className="mt-1 text-sm text-stone-600">
            {viewingOtherUser ? (
              <>
                Oversigt over møder booket af <strong>{viewingName}</strong> — status og kommende
                møder.
              </>
            ) : (
              <>
                Oversigt over de møder du har booket — hold dine kunder til ilden, så de dukker op.
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

      <div>
        <h2 className="text-sm font-semibold text-stone-900">
          {viewingOtherUser ? `Kommende møder (${viewingName})` : "Dine kommende møder"}
        </h2>
        {upcomingMeetings.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
            {viewingOtherUser
              ? "Ingen kommende møder for denne bruger."
              : "Ingen kommende møder — book det næste!"}
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {upcomingMeetings.map((l) => {
              const cancelled = isCancelledOutcome(l.meetingOutcomeStatus);
              return (
              <div
                key={l.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md ${
                  cancelled ? "border-red-300 bg-red-50/60" : "border-stone-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={buildLeadDetailHref(l.leadId ?? l.id, KNOWN_LEAD_SOURCES.mineSalg)}
                      className="line-clamp-2 break-words font-semibold text-stone-900 hover:underline"
                    >
                      {l.companyName}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-stone-600">
                      {l.meetingContactName?.trim() || "Kontaktperson ikke angivet"}
                    </p>
                  </div>
                  {cancelled ? (
                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-red-700 px-2.5 py-1 text-xs font-semibold text-white">
                      Ej mødt
                    </span>
                  ) : (
                    <MeetingCountdown scheduledFor={l.meetingScheduledFor!} />
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">
                      Mødet afholdes
                    </dt>
                    <dd className="mt-0.5 font-medium text-stone-800">
                      {formatDaDateTime(l.meetingScheduledFor)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">
                      Booket den
                    </dt>
                    <dd className="mt-0.5 text-stone-600">{formatDaDateTime(l.meetingBookedAt)}</dd>
                  </div>
                </dl>
                {cancelled ? (
                  <p className="rounded-lg bg-red-100 px-3 py-2 text-xs font-medium text-red-900 ring-1 ring-inset ring-red-200">
                    Kunden dukkede ikke op — følg op og få mødet genbooket.
                  </p>
                ) : (
                  new Date(l.meetingScheduledFor!).getTime() < Date.now() && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200/70">
                      Mødedatoen er passeret — blev mødet afholdt, eller skal der genbookes?
                    </p>
                  )
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-blue-950 shadow-sm">
        <h2 className="font-semibold text-blue-950">Sådan tjener du</h2>
        <ul className="mt-3 space-y-2 text-blue-900/90">
          <li>
            <strong>300 kr</strong> pr. møde, hvor kunden dukker op.
          </li>
          <li>
            <strong>Op til 1.250 kr</strong> pr. møde der lukkes — svarende til 50 % af prisen på
            den aftale, kunden lukkes på.
          </li>
          <li>
            <strong>Op til 2.500 kr</strong> hvis du selv afholder mødet og lukker kunden —
            svarende til 100 % af kundens betaling den første måned.
          </li>
        </ul>
        <p className="mt-3 text-xs text-blue-900/70">
          Jo bedre du holder dine kunder til ilden inden mødet, desto større er chancen for, at de
          tager telefonen og dukker op.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-stone-900">
          {viewingOtherUser ? `Alle møder (${viewingName})` : "Alle dine møder"}
        </h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr>
                <th className="px-3 py-2 font-medium">Virksomhed</th>
                <th className="px-3 py-2 font-medium">Kontaktperson</th>
                <th className="px-3 py-2 font-medium">Mødetid</th>
                <th className="px-3 py-2 font-medium">Booket</th>
                <th className="px-3 py-2 font-medium">Udfald</th>
                <th className="px-3 py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {allMeetings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                    {viewingOtherUser ? "Ingen bookede møder for denne bruger." : "Du har ikke booket møder endnu."}
                  </td>
                </tr>
              ) : (
                allMeetings.map((l) => (
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
                      {l.meetingContactName?.trim() || "—"}
                    </td>
                    <td className="px-3 py-2 text-stone-700">{formatDaDateTime(l.meetingScheduledFor)}</td>
                    <td className="px-3 py-2 text-stone-600">{formatDaDateTime(l.meetingBookedAt)}</td>
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
