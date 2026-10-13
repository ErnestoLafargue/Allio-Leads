"use client";

import { useState } from "react";
import {
  formatCopenhagenDateTimeLocal,
  notifyTimeClockChanged,
  parseCopenhagenDateTimeLocal,
  type TimeClockEntryDto,
} from "@/lib/time-clock";

export function TimeClockAdminEditForm({
  userId,
  viewDayKey,
  entry,
  onCancel,
  onSaved,
}: {
  userId: string;
  viewDayKey: string;
  entry: TimeClockEntryDto | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [inLocal, setInLocal] = useState(() =>
    entry
      ? formatCopenhagenDateTimeLocal(entry.punchedInAt)
      : `${viewDayKey}T08:00`,
  );
  const [outLocal, setOutLocal] = useState(() =>
    entry
      ? entry.punchedOutAt
        ? formatCopenhagenDateTimeLocal(entry.punchedOutAt)
        : ""
      : `${viewDayKey}T16:00`,
  );
  const [stillIn, setStillIn] = useState(() => entry?.open === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const punchedInAt = parseCopenhagenDateTimeLocal(inLocal);
    if (!punchedInAt) {
      setError("Ugyldigt ind-tidspunkt.");
      return;
    }
    if (!stillIn && !outLocal.trim()) {
      setError("Angiv ud-tidspunkt, eller markér «Stadig stemplet ind».");
      return;
    }
    const punchedOutAt = stillIn ? null : parseCopenhagenDateTimeLocal(outLocal);
    if (!stillIn && !punchedOutAt) {
      setError("Ugyldigt ud-tidspunkt.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = entry
        ? await fetch(`/api/time-clock/entries/${encodeURIComponent(entry.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              punchedInAt: punchedInAt.toISOString(),
              punchedOutAt: punchedOutAt?.toISOString() ?? null,
            }),
          })
        : await fetch("/api/time-clock/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              punchedInAt: punchedInAt.toISOString(),
              punchedOutAt: punchedOutAt?.toISOString() ?? null,
            }),
          });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "Kunne ikke gemme.");
        return;
      }
      notifyTimeClockChanged();
      onSaved();
    } catch {
      setError("Kunne ikke gemme.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(ev) => void save(ev)} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="block text-xs text-stone-600">
        Ind
        <input
          type="datetime-local"
          value={inLocal}
          onChange={(ev) => setInLocal(ev.target.value)}
          step={60}
          required
          className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900"
        />
      </label>
      <label className="block text-xs text-stone-600">
        Ud
        <input
          type="datetime-local"
          value={stillIn ? "" : outLocal}
          onChange={(ev) => {
            setStillIn(false);
            setOutLocal(ev.target.value);
          }}
          step={60}
          disabled={stillIn}
          className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900 disabled:bg-stone-100"
        />
      </label>
      <label className="flex items-center gap-2 pb-1.5 text-xs text-stone-700">
        <input
          type="checkbox"
          checked={stillIn}
          onChange={(ev) => setStillIn(ev.target.checked)}
        />
        Stadig stemplet ind
      </label>
      <div className="flex gap-2 pb-0.5">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {busy ? "Gemmer…" : "Gem"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          Annuller
        </button>
      </div>
      {error ? <p className="w-full text-xs text-rose-600">{error}</p> : null}
    </form>
  );
}
