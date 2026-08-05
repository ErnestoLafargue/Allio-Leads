"use client";

import { useEffect, useState } from "react";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatRemaining(diffMs: number): string {
  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diffMs % HOUR_MS) / (60 * 1000));
  if (days >= 1) return `${days} d ${hours} t`;
  return `${hours} t ${minutes} m`;
}

function badgeClass(diffMs: number): string {
  if (diffMs <= 0) return "bg-stone-100 text-stone-600 ring-stone-200";
  if (diffMs < 48 * HOUR_MS) return "bg-red-100 text-red-800 ring-red-200";
  if (diffMs < 96 * HOUR_MS) return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-emerald-100 text-emerald-800 ring-emerald-200";
}

/** Farvet nedtæller til mødetidspunkt: rød < 48 t, gul < 4 dage, ellers grøn. */
export function MeetingCountdown({ scheduledFor }: { scheduledFor: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const diffMs = new Date(scheduledFor).getTime() - now;
  const label = diffMs <= 0 ? "Afventer udfald" : `Om ${formatRemaining(diffMs)}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${badgeClass(diffMs)}`}
      title={new Date(scheduledFor).toLocaleString("da-DK")}
    >
      {diffMs > 0 && (
        <span aria-hidden className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {label}
    </span>
  );
}
