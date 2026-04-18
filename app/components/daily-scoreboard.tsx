"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export type LeaderboardRow = {
  userId: string;
  name: string;
  username: string;
  role: string;
  meetings: number;
  conversations: number;
  contacts: number;
};

export type LeaderboardPayload = {
  dayKey: string;
  todayKey: string;
  dayLabel: string;
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

export function DailyScoreboard() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");

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

  return (
    <div className="space-y-3 rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-950">
          Scoreboard pr. dag · kontakt-episoder (Ny markerer nyt forsøg, København)
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
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="border-b border-amber-100 bg-amber-50/80 text-amber-950/80">
            <tr>
              <th className="w-10 px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Bruger</th>
              <th className="px-3 py-2.5 font-medium">Rolle</th>
              <th className="px-3 py-2.5 text-right font-medium tabular-nums">Møder</th>
              <th className="px-3 py-2.5 text-right font-medium tabular-nums">Samtaler</th>
              <th className="px-3 py-2.5 text-right font-medium tabular-nums">Kontakter</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-50">
            {data.rows.map((r, i) => {
              const isMe = me != null && r.userId === me;
              return (
                <tr
                  key={r.userId}
                  className={
                    isMe ? "bg-sky-50/80 ring-1 ring-sky-200/60" : i === 0 ? "bg-amber-50/40" : undefined
                  }
                >
                  <td className="px-3 py-2.5 text-stone-500">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-stone-900">
                      {r.name}
                      {isMe ? (
                        <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-normal text-sky-900">
                          Dig
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-500">{r.username}</span>
                  </td>
                  <td className="px-3 py-2.5 text-stone-600">
                    {r.role === "ADMIN" ? "Admin" : "Sælger"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-stone-900">{r.meetings}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-stone-800">{r.conversations}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-stone-700">{r.contacts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.rows.length === 0 && (
        <p className="text-sm text-stone-600">Ingen aktivitet denne dag (login eller udfald).</p>
      )}
    </div>
  );
}
