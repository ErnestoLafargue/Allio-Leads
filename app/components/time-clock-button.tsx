"use client";

import { formatClockedDuration, formatClockedLive } from "@/lib/time-clock";
import { useTimeClock } from "@/lib/use-time-clock";

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function TimeClockButton({ compact }: { compact?: boolean }) {
  const { status, error, busy, punch, openSeconds, todaySeconds } = useTimeClock();
  const clockedIn = status?.clockedIn === true;
  const label = clockedIn ? "Stemple ud" : "Stemple ind";
  const title = error
    ? error
    : !status
      ? "Stempling"
      : clockedIn
        ? `Stemplet ind · ${formatClockedLive(openSeconds)} — tryk for at stemple ud`
        : "Stemple ind";

  return (
    <div className={compact ? "" : "space-y-1"}>
      <button
        type="button"
        disabled={busy || !status}
        onClick={() => void punch(clockedIn ? "out" : "in")}
        title={compact ? title : undefined}
        aria-label={title}
        className={[
          "flex w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
          compact ? "h-10 justify-center px-0" : "h-auto py-2",
          clockedIn
            ? "bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
            : "bg-white/5 text-stone-100 hover:bg-white/10",
          "disabled:cursor-wait disabled:opacity-70",
        ].join(" ")}
      >
        <span className="relative shrink-0">
          <ClockIcon className="h-5 w-5" />
          {clockedIn ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-950"
              aria-hidden
            />
          ) : null}
        </span>
        {!compact ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate">{label}</span>
            <span className="block truncate text-[11px] font-normal text-stone-300/90">
              {clockedIn
                ? `${formatClockedLive(openSeconds)} · i dag ${formatClockedDuration(todaySeconds)}`
                : status
                  ? `I dag ${formatClockedDuration(todaySeconds)}`
                  : "Henter…"}
            </span>
          </span>
        ) : null}
      </button>
      {!compact && error ? <p className="px-1 text-[11px] text-rose-300">{error}</p> : null}
    </div>
  );
}
