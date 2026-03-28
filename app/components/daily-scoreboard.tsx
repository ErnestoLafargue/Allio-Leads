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
  dayLabel: string;
  rows: LeaderboardRow[];
};

export function DailyScoreboard() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/users/leaderboard");
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
  }, [status]);

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
        <h2 className="text-sm font-semibold text-amber-950">Dagens scoreboard · logget ind i dag</h2>
        <p className="text-xs font-medium text-amber-800/90">{data.dayLabel}</p>
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
        <p className="text-sm text-stone-600">Ingen har logget ind i dag endnu.</p>
      )}
    </div>
  );
}
