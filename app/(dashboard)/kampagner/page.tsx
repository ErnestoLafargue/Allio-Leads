"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  campaignShowsStartButton,
  normalizeCampaignDialMode,
} from "@/lib/dial-mode";
import { VoipAudioSettingsButton } from "@/app/components/voip-audio-settings-button";
import { DashboardTabs } from "@/app/components/dashboard-tabs";

type Campaign = {
  id: string;
  name: string;
  fieldConfig: string;
  createdAt: string;
  updatedAt: string;
  systemCampaignType?: string | null;
  dialMode?: string | null;
  agentsOnline?: number;
  myCallbacks?: number;
  _count: { leads: number };
};

const PINNED_TOP_TYPES = new Set(["active_customers", "upcoming_meetings", "rebooking"]);

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function PhonePlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LeadsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function CallbackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function StartPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorHint, setLoadErrorHint] = useState<"migrate" | "retry_later" | null>(null);
  const [search, setSearch] = useState("");

  const isAdmin = session?.user.role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadErrorHint(null);

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(Array.isArray(data) ? data : []);
        setLoading(false);
        return;
      }

      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        userHint?: string;
      };
      const hint =
        j.userHint === "migrate" || j.userHint === "retry_later" ? j.userHint : null;

      if (res.status === 401) {
        setCampaigns([]);
        setLoadError(
          typeof j.error === "string" ? j.error : "Du skal være logget ind.",
        );
        setLoadErrorHint(null);
        setLoading(false);
        return;
      }

      if (hint === "migrate") {
        setCampaigns([]);
        setLoadError(
          typeof j.error === "string" ? j.error : "Kunne ikke hente kampagner.",
        );
        setLoadErrorHint("migrate");
        setLoading(false);
        return;
      }

      const retryableStatus =
        res.status === 500 || res.status === 502 || res.status === 503;
      const shouldRetry =
        attempt < maxAttempts - 1 &&
        retryableStatus &&
        (hint === "retry_later" || hint === null);

      if (shouldRetry) {
        await delay(1000 * (attempt + 1));
        continue;
      }

      setCampaigns([]);
      setLoadError(
        typeof j.error === "string" ? j.error : "Kunne ikke hente kampagner.",
      );
      setLoadErrorHint(hint === "retry_later" ? "retry_later" : null);
      setLoading(false);
      return;
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /// Refresh campaign-counts hvert 30 sek så «Agenter online» og «Mine genopkald» holder sig friske.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const hasVoipCampaign = useMemo(
    () => campaigns.some((c) => campaignShowsStartButton(normalizeCampaignDialMode(c.dialMode))),
    [campaigns],
  );

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [campaigns, search]);

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => {
        acc.leads += c._count.leads ?? 0;
        acc.callbacks += c.myCallbacks ?? 0;
        acc.agents += c.agentsOnline ?? 0;
        return acc;
      },
      { leads: 0, callbacks: 0, agents: 0 },
    );
  }, [campaigns]);

  return (
    <div className="space-y-5">
      <DashboardTabs />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Dialer</p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Start</h1>
          <p className="mt-1 text-sm text-stone-500">
            Vælg en kampagne for at starte arbejdsflowet — ring → næste → ring → næste.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasVoipCampaign ? <VoipAudioSettingsButton /> : null}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg kampagne…"
            className="w-full min-w-[180px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 sm:w-56"
          />
        </div>
      </header>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Kampagner" value={campaigns.length} accent="emerald" />
        <StatCard label="Leads i alt" value={totals.leads} accent="stone" />
        <StatCard label="Agenter online" value={totals.agents} accent="emerald" pulse={totals.agents > 0} />
        <StatCard label="Mine genopkald" value={totals.callbacks} accent="amber" />
      </div>

      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">{loadError}</p>
          {loadErrorHint === "migrate" ? (
            <p className="mt-2 text-amber-900/90">
              Hvis du lige har opdateret koden: kør{" "}
              <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs">
                npx prisma migrate deploy
              </code>{" "}
              i projektmappen og genstart udviklingsserveren — så matcher databasen igen, og kampagnerne
              vises.
            </p>
          ) : loadErrorHint === "retry_later" ? (
            <p className="mt-2 text-amber-900/90">
              Det kan være en kort forstyrrelse (fx under deploy eller hvis Neon var inaktiv). Prøv at
              genindlæse siden om lidt.
            </p>
          ) : null}
        </div>
      )}

      {/* Campaigns table */}
      <section
        aria-label="Kampagner"
        className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">Kampagner</h2>
          <span className="text-xs text-stone-500">
            {filteredCampaigns.length} af {campaigns.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50/70 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="w-20 px-5 py-3">Start</th>
                <th className="px-5 py-3">Navn</th>
                <th className="hidden px-5 py-3 md:table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    <UsersIcon className="h-3.5 w-3.5" /> Agenter online
                  </span>
                </th>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <LeadsIcon className="h-3.5 w-3.5" /> Leads
                  </span>
                </th>
                <th className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <CallbackIcon className="h-3.5 w-3.5" /> Mine genopkald
                  </span>
                </th>
                {isAdmin && <th className="px-5 py-3 text-right">Indstillinger</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <SkeletonRows isAdmin={isAdmin} />
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-5 py-10 text-center text-sm text-stone-500"
                  >
                    {campaigns.length === 0 ? (
                      <>
                        Ingen kampagner endnu.{" "}
                        {isAdmin ? (
                          <Link
                            href="/import"
                            className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                          >
                            Opret én under «Opret &amp; Import»
                          </Link>
                        ) : (
                          "Kontakt en administrator."
                        )}
                      </>
                    ) : (
                      <>
                        Ingen kampagner matcher «{search}».{" "}
                        <button
                          type="button"
                          onClick={() => setSearch("")}
                          className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                        >
                          Ryd søgning
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((c) => {
                  const dialMode = normalizeCampaignDialMode(c.dialMode);
                  const showStart = campaignShowsStartButton(dialMode);
                  const isPinned = PINNED_TOP_TYPES.has(
                    String(c.systemCampaignType ?? "").trim(),
                  );
                  const agents = c.agentsOnline ?? 0;
                  const callbacks = c.myCallbacks ?? 0;
                  const onRowClick = () => {
                    router.push(`/kampagner/${c.id}/arbejd`);
                  };
                  return (
                    <tr
                      key={c.id}
                      onClick={onRowClick}
                      className={[
                        "group cursor-pointer transition-colors",
                        isPinned ? "bg-emerald-50/40" : "",
                        "hover:bg-stone-50/90",
                      ].join(" ")}
                    >
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {showStart ? (
                          <Link
                            href={`/kampagner/${c.id}/arbejd?voipSession=1`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-sm ring-1 ring-emerald-700/20 transition hover:from-emerald-600 hover:to-emerald-800 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                            aria-label={`Start ${c.name}`}
                            title="Start kampagne (åbner VoIP-session)"
                          >
                            <PhonePlayIcon className="h-4 w-4" />
                          </Link>
                        ) : (
                          <Link
                            href={`/kampagner/${c.id}/arbejd`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700"
                            aria-label={`Åbn ${c.name}`}
                            title="Åbn kampagne (manuel)"
                          >
                            <PhonePlayIcon className="h-4 w-4" />
                          </Link>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-medium text-stone-900 group-hover:text-stone-950">
                            {c.name}
                          </span>
                          {isPinned ? (
                            <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-emerald-100/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              System
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden px-5 py-3.5 md:table-cell">
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            agents > 0
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60"
                              : "bg-stone-100 text-stone-500",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "h-1.5 w-1.5 rounded-full",
                              agents > 0 ? "bg-emerald-500" : "bg-stone-400",
                            ].join(" ")}
                            aria-hidden
                          />
                          {agents}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-stone-700">
                        {c._count.leads.toLocaleString("da-DK")}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums">
                        <span
                          className={
                            callbacks > 0
                              ? "font-semibold text-amber-700"
                              : "text-stone-500"
                          }
                        >
                          {callbacks}
                        </span>
                      </td>
                      {isAdmin && (
                        <td
                          className="px-5 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/kampagner/${c.id}`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                          >
                            Indstillinger
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  pulse,
}: {
  label: string;
  value: number;
  accent: "emerald" | "stone" | "amber";
  pulse?: boolean;
}) {
  const palette: Record<typeof accent, string> = {
    emerald: "from-emerald-50 to-white text-emerald-900 ring-emerald-100",
    stone: "from-stone-50 to-white text-stone-900 ring-stone-200",
    amber: "from-amber-50 to-white text-amber-900 ring-amber-200",
  };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 ring-1 shadow-sm ${palette[accent]}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
        {value.toLocaleString("da-DK")}
        {pulse ? (
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        ) : null}
      </p>
    </div>
  );
}

function SkeletonRows({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-5 py-4">
            <div className="h-9 w-9 rounded-full bg-stone-100" />
          </td>
          <td className="px-5 py-4">
            <div className="h-3 w-40 rounded bg-stone-100" />
          </td>
          <td className="hidden px-5 py-4 md:table-cell">
            <div className="h-3 w-12 rounded bg-stone-100" />
          </td>
          <td className="px-5 py-4">
            <div className="h-3 w-10 rounded bg-stone-100" />
          </td>
          <td className="px-5 py-4">
            <div className="h-3 w-8 rounded bg-stone-100" />
          </td>
          {isAdmin && (
            <td className="px-5 py-4">
              <div className="ml-auto h-3 w-20 rounded bg-stone-100" />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
