"use client";

/**
 * Live-coachen i hjørnet af opkaldssiderne (kampagne-arbejdsfladen og lead-siderne). Knappen
 * «Live-coach: til/fra» ligger der altid; selve coachen åbner først under et aktivt opkald
 * (klik-for-at-ringe, predictive, power dialer), når den er slået til. Valget huskes i browseren.
 */
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useActiveCallAudio } from "@/lib/live-coach/call-audio";
import { LiveCoach } from "./live-coach";

const STORAGE_KEY = "allio.liveCoach.enabled";
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // privat vindue o.l. — standard: slukket
  }
}

function setEnabled(next: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
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
  const enabled = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readEnabled,
    () => false,
  );

  if (!call && !CALL_PAGES.some((r) => r.test(pathname))) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col items-end gap-2 [&>*]:pointer-events-auto">
      {enabled && call ? <LiveCoach micStream={call.mic} remoteStream={call.remote} leadId={call.leadId} active /> : null}
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
