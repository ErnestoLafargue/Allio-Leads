"use client";

import { useSession } from "next-auth/react";
import { Fragment, useEffect, useState } from "react";

export type LeaderboardCampaignSlice = {
  campaignId: string | null;
  campaignName: string;
  meetings: number;
  conversations: number;
  contacts: number;
  talkSeconds: number;
  dialerSeconds: number;
  dialerSecondsEstimated?: boolean;
  avgConversationSeconds: number;
  buyRatePct: number;
};

export type LeaderboardRow = {
  userId: string;
  name: string;
  username: string;
  role: string;
  meetings: number;
  conversations: number;
  contacts: number;
  /** Kun i payload for admin */
  talkSeconds?: number;
  loginSeconds?: number;
  loginSecondsEstimated?: boolean;
  dialerSeconds?: number;
  dialerSecondsEstimated?: boolean;
  avgConversationSeconds?: number;
  buyRatePct?: number;
  campaigns?: LeaderboardCampaignSlice[];
};

export type LeaderboardPayload = {
  dayKey: string;
  todayKey: string;
  dayLabel: string;
  isAdmin?: boolean;
  rows: LeaderboardRow[];
};

function shiftDayKey(dayKey: string, diffDays: number): string {
  const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dayKey;
  const dt = new Date(Date.UTC(y, m - 1, d + diffDays, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Login-/dialer-tid: "2 t 05 m" / "45 m" / "—" ved 0. Estimater får en stjerne. */
function formatPresence(seconds: number | undefined, estimated?: boolean): string {
  const s = seconds ?? 0;
  if (s <= 0) return "—";
  const totalMinutes = Math.round(s / 60);
  const label =
    totalMinutes < 1
      ? "< 1 m"
      : (() => {
          const h = Math.floor(totalMinutes / 60);
          const m = totalMinutes % 60;
          return h > 0 ? `${h} t ${m.toString().padStart(2, "0")} m` : `${m} m`;
        })();
  return estimated ? `${label}*` : label;
}

const ESTIMATE_TITLE = "Estimeret ud fra opkalds- og udfaldsaktivitet (ingen måling denne dag)";

/** Gns. samtaletid: "1:42" (m:ss), "—" ved 0. */
function formatTalk(seconds: number | undefined): string {
  const s = Math.round(seconds ?? 0);
  if (s <= 0) return "—";
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function formatBuyRate(pct: number | undefined, conversations: number): string {
  if (conversations <= 0) return "—";
  return `${(pct ?? 0).toLocaleString("da-DK")} %`;
}

export function DailyScoreboard() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    async function load() {
      const qs = new URLSearchParams();
      if (selectedDayKey) qs.set("dayKey", selectedDayKey);
      const res = await fetch(`/api/users/leaderboard?${qs.toString()}`);
      if (!res.ok) {
        if (!cancelled) setError("Kunne ikke hente scoreboard");
        return;
      }
      const json = (await res.json()) as LeaderboardPayload;
      if (!cancelled) {
        setData(json);
        setError(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, selectedDayKey]);

  if (status === "loading") {
    return <p className="text-sm text-stone-500">Henter scoreboard…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data) {
    return null;
  }

  const me = session?.user?.id;
  const isAdmin = data.isAdmin === true;
  const columnCount = isAdmin ? 10 : 6;

  return (
    <div className="space-y-3 rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-950">
          Scoreboard pr. dag · kontakter og samtaler fra opkald (Telnyx/WebRTC), møder fra udfald ·
          København
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDayKey((k) => shiftDayKey(k || data.dayKey, -1))}
            className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50"
          >
            Forrige dag
          </button>
          <input
            type="date"
            value={selectedDayKey || data.dayKey}
            max={data.todayKey}
            onChange={(e) => setSelectedDayKey(e.target.value)}
            className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-amber-950"
          />
          <button
            type="button"
            onClick={() => setSelectedDayKey(data.todayKey)}
            disabled={(selectedDayKey || data.dayKey) === data.todayKey}
            className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-60"
          >
            I dag
          </button>
          <p className="text-xs font-medium text-amber-800/90">{data.dayLabel}</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-amber-100 bg-white/90">
        <table className={`w-full ${isAdmin ? "min-w-[64rem]" : "min-w-[28rem]"} text-left text-sm`}>
          <thead className="border-b border-amber-100 bg-amber-50/80 text-amber-950/80">
            <tr>
              <th className="w-10 px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Bruger</th>
              <th className="px-3 py-2.5 font-medium">Rolle</th>
              <th className="px-3 py-2.5 text-right font-medium tabular-nums">Møder</th>
              <th className="px-3 py-2.5 text-right font-medium tabular-nums">Samtaler</th>
              <th className="px-3 py-2.5 text-right font-medium tabular-nums">Kontakter</th>
              {isAdmin && (
                <>
                  <th className="px-3 py-2.5 text-right font-medium tabular-nums">Login-tid</th>
                  <th className="px-3 py-2.5 text-right font-medium tabular-nums">Dialer-tid</th>
                  <th className="px-3 py-2.5 text-right font-medium tabular-nums">Gns. samtale</th>
                  <th className="px-3 py-2.5 text-right font-medium tabular-nums">Buyrate</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-50">
            {data.rows.map((r, i) => {
              const isMe = me != null && r.userId === me;
              const isExpanded = isAdmin && expandedUserId === r.userId;
              const hasCampaigns = (r.campaigns?.length ?? 0) > 0;
              return (
                <Fragment key={r.userId}>
                  <tr
                    className={
                      isMe
                        ? "bg-sky-50/80 ring-1 ring-sky-200/60"
                        : i === 0
                          ? "bg-amber-50/40"
                          : undefined
                    }
                  >
                    <td className="px-3 py-2.5 text-stone-500">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedUserId((cur) => (cur === r.userId ? null : r.userId))
                          }
                          className="group flex items-center gap-1.5 text-left"
                          title={
                            hasCampaigns
                              ? "Vis fordeling pr. kampagne"
                              : "Ingen kampagneaktivitet denne dag"
                          }
                        >
                          <span
                            className={`text-[10px] text-amber-700 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                            aria-hidden
                          >
                            ▶
                          </span>
                          <span>
                            <span className="font-medium text-stone-900 underline-offset-2 group-hover:underline">
                              {r.name}
                              {isMe ? (
                                <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-normal text-sky-900">
                                  Dig
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-xs text-stone-500">
                              {r.username}
                            </span>
                          </span>
                        </button>
                      ) : (
                        <>
                          <span className="font-medium text-stone-900">
                            {r.name}
                            {isMe ? (
                              <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-normal text-sky-900">
                                Dig
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-stone-500">{r.username}</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-stone-600">
                      {r.role === "ADMIN" ? "Admin" : "Sælger"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-stone-900">
                      {r.meetings}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-stone-800">
                      {r.conversations}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-stone-700">
                      {r.contacts}
                    </td>
                    {isAdmin && (
                      <>
                        <td
                          className="px-3 py-2.5 text-right tabular-nums text-stone-700"
                          title={r.loginSecondsEstimated ? ESTIMATE_TITLE : undefined}
                        >
                          {formatPresence(r.loginSeconds, r.loginSecondsEstimated)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right tabular-nums text-stone-700"
                          title={r.dialerSecondsEstimated ? ESTIMATE_TITLE : undefined}
                        >
                          {formatPresence(r.dialerSeconds, r.dialerSecondsEstimated)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-stone-700">
                          {formatTalk(r.avgConversationSeconds)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-stone-700">
                          {formatBuyRate(r.buyRatePct, r.conversations)}
                        </td>
                      </>
                    )}
                  </tr>
                  {isExpanded && (
                    <>
                      {hasCampaigns ? (
                        r.campaigns!.map((c) => (
                          <tr
                            key={`${r.userId}-${c.campaignId ?? "none"}`}
                            className="bg-stone-50/80 text-xs"
                          >
                            <td className="px-3 py-2" />
                            <td className="py-2 pl-8 pr-3 text-stone-700" colSpan={2}>
                              <span className="font-medium">{c.campaignName}</span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-stone-800">
                              {c.meetings}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-stone-700">
                              {c.conversations}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                              {c.contacts}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-stone-400">—</td>
                            <td
                              className="px-3 py-2 text-right tabular-nums text-stone-600"
                              title={c.dialerSecondsEstimated ? ESTIMATE_TITLE : undefined}
                            >
                              {formatPresence(c.dialerSeconds, c.dialerSecondsEstimated)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                              {formatTalk(c.avgConversationSeconds)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                              {formatBuyRate(c.buyRatePct, c.conversations)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr className="bg-stone-50/80 text-xs">
                          <td className="px-3 py-2" />
                          <td className="py-2 pl-8 pr-3 text-stone-500" colSpan={columnCount - 1}>
                            Ingen kampagneaktivitet denne dag.
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Kontakter: opkaldsforsøg (max ét pr. 2 t. pr. lead); samtaler: ≥ 20 s. forbundet tale
        (dage uden registreret taletid: udfald der kræver samtale); møder: booket møde via udfald.
        {isAdmin
          ? " Login-/dialer-tid måles mens Allio-fanen er åben; buyrate er møder pr. samtale. Stjerne (*) betyder estimeret tid ud fra opkaldsaktivitet på dage før målingen begyndte. Gns. samtale kræver registreret taletid og er derfor tom for dage før 5. august. Klik på en bruger for fordeling pr. kampagne."
          : ""}
      </p>
      {data.rows.length === 0 && (
        <p className="text-sm text-stone-600">Ingen rækker denne dag (login eller aktivitet).</p>
      )}
    </div>
  );
}
