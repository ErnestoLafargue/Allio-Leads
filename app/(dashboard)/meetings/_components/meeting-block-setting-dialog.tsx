"use client";

import { useEffect, useState } from "react";

const OPTIONS = [55, 75] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** Kaldes efter vellykket gem med den nye værdi. */
  onSaved?: (minutes: number) => void;
};

/** Admin-dialog: vælg mødeblok (buffer før/efter mødestart) — 55 eller 75 min. */
export function MeetingBlockSettingDialog({ open, onClose, onSaved }: Props) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await fetch("/api/admin/meeting-block-setting");
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Kunne ikke hente indstillingen.");
        return;
      }
      const data = (await res.json()) as { minutes: number };
      if (!cancelled) setMinutes(data.minutes);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save() {
    if (minutes == null || saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/meeting-block-setting", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme indstillingen.");
      return;
    }
    onSaved?.(minutes);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-block-setting-title"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border-2 border-stone-300 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="meeting-block-setting-title" className="text-lg font-semibold text-stone-900">
          Kalender-indstillinger
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Mødebuffer før/efter start: hvert møde reserverer det valgte antal minutter både før og
          efter starttidspunktet i booking-kalenderen.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-stone-500">Henter…</p>
        ) : (
          <div className="mt-4 flex gap-3">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={minutes === opt}
                onClick={() => setMinutes(opt)}
                className={[
                  "flex-1 rounded-lg border px-4 py-3 text-sm font-semibold shadow-sm transition",
                  minutes === opt
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
                ].join(" ")}
              >
                {opt} min
                <span
                  className={[
                    "mt-0.5 block text-xs font-normal",
                    minutes === opt ? "text-stone-300" : "text-stone-500",
                  ].join(" ")}
                >
                  ±{opt} min pr. møde
                </span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Annuller
          </button>
          <button
            type="button"
            disabled={saving || loading || minutes == null}
            onClick={() => void save()}
            className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
          >
            {saving ? "Gemmer…" : "Gem"}
          </button>
        </div>
      </div>
    </div>
  );
}
