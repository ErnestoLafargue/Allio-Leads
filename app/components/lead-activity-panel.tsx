"use client";

import { useCallback, useEffect, useState } from "react";

export type ActivityItem = {
  kind: "visit" | "note" | "call" | "call_attempt" | "outcome" | "callback_schedule";
  at: string;
  summary: string;
  user: { name: string; username: string } | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
};

type Props = { leadId: string };

export function LeadActivityPanel({ leadId }: Props) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/leads/${leadId}/activity`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente aktivitet");
      setItems([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items?: ActivityItem[] };
    setItems(Array.isArray(data.items) ? data.items : []);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      id="lead-aktivitet"
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm scroll-mt-4"
      aria-labelledby="lead-aktivitet-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="lead-aktivitet-heading" className="text-sm font-semibold text-stone-900">
          Aktivitet
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline"
        >
          Opdater
        </button>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        Besøg i køen, gemt udfald, planlagte tilbagekald, noter (kort log) og opkaldsforsøg/optagelser — uden hver eneste tastning.
      </p>
      {loading && <p className="mt-3 text-sm text-stone-500">Henter…</p>}
      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="mt-3 text-sm text-stone-500">Ingen aktivitet endnu.</p>
      )}
      {!loading && items.length > 0 && (
        <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1 text-sm">
          {items.map((row, i) => (
            <li
              key={`${row.at}-${i}`}
              className="rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2"
            >
              <p className="text-xs text-stone-500">
                {new Date(row.at).toLocaleString("da-DK", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-0.5 font-medium text-stone-900">{row.summary}</p>
              {row.user && (
                <p className="mt-0.5 text-xs text-stone-600">
                  {row.user.name}{" "}
                  <span className="text-stone-400">(@{row.user.username})</span>
                </p>
              )}
              {row.kind === "call" && row.recordingUrl ? (
                <audio controls className="mt-2 h-8 w-full max-w-md" src={row.recordingUrl}>
                  <track kind="captions" />
                </audio>
              ) : null}
              {row.kind === "call" && !row.recordingUrl ? (
                <p className="mt-1 text-xs text-stone-500">Optagelse ikke tilgængelig endnu.</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
