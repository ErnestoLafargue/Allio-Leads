"use client";

/**
 * Live-coachen i hjørnet af opkaldssiderne (kampagne-arbejdsfladen og lead-siderne). Knappen
 * «Live-coach: til/fra» ligger der altid; selve coachen åbner først under et aktivt opkald
 * (klik-for-at-ringe, predictive, power dialer), når den er slået til, og det sidste kort bliver
 * stående efter opkaldet, til næste opkald starter.
 *
 * Standard er fra. Kun aktivt tryk tænder den. Hver morgen kl. 08:00 (Europe/Copenhagen)
 * slås den automatisk fra igen, så den ikke bruger credits overnight.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useActiveCallAudio } from "@/lib/live-coach/call-audio";
import { liveCoachDayKey, nextLiveCoachResetAt } from "@/lib/live-coach/daily-reset";
import { LiveCoach } from "./live-coach";

const STORAGE_KEY = "allio.liveCoach.enabled";
const DAY_KEY = "allio.liveCoach.day";
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEY) !== "1") return false;
    const storedDay = localStorage.getItem(DAY_KEY);
    if (!storedDay || storedDay !== liveCoachDayKey()) {
      localStorage.setItem(STORAGE_KEY, "0");
      localStorage.removeItem(DAY_KEY);
      return false;
    }
    return true;
  } catch {
    return false; // privat vindue o.l. — standard: slukket
  }
}

function setEnabled(next: boolean): void {
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, "1");
      localStorage.setItem(DAY_KEY, liveCoachDayKey());
    } else {
      localStorage.setItem(STORAGE_KEY, "0");
      localStorage.removeItem(DAY_KEY);
    }
  } catch {
    /* ignorér */
  }
  listeners.forEach((l) => l());
}

/** Sider, hvor man ringer: kampagne-arbejdsfladen og det enkelte lead. */
const CALL_PAGES = [/^\/kampagner\/[^/]+\/arbejd/, /^\/leads\/(?!lydfiler$|duplicates$)[^/]+$/];

export function LiveCoachDock() {
  const call = useActiveCallAudio();
  const pathname = usePathname() ?? "";
  // Det seneste opkald huskes, så coachen (og dens sidste kort) bliver vist, efter kunden har lagt på.
  const [lastCall, setLastCall] = useState(call);
  if (call && call !== lastCall) setLastCall(call);
  const enabled = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readEnabled,
    () => false,
  );

  // Auto-fra kl. 08:00, også hvis fanen står åben overnight.
  useEffect(() => {
    if (!enabled) return;
    const ms = nextLiveCoachResetAt().getTime() - Date.now();
    const t = window.setTimeout(() => setEnabled(false), Math.max(ms, 0));
    return () => window.clearTimeout(t);
  }, [enabled]);

  if (!call && !CALL_PAGES.some((r) => r.test(pathname))) return null;
  const shown = call ?? lastCall;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col items-end gap-2 [&>*]:pointer-events-auto">
      {enabled && shown ? <LiveCoach micStream={shown.mic} remoteStream={shown.remote} leadId={shown.leadId} active={call !== null} /> : null}
      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        aria-pressed={enabled}
        className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ${enabled ? "bg-emerald-700 text-white" : "border border-stone-300 bg-white text-stone-700"}`}
      >
        Live-coach: {enabled ? "til" : "fra"}
      </button>
    </div>
  );
}
