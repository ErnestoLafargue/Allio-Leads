"use client";

/**
 * Live-coachen i samtalevisningen: vises under ethvert aktivt opkald (klik-for-at-ringe, predictive,
 * power dialer). Sælgeren tænder/slukker selv (standard: slukket); valget huskes i browseren.
 */
import { useState } from "react";
import { useActiveCallAudio } from "@/lib/live-coach/call-audio";
import { LiveCoach } from "./live-coach";

const STORAGE_KEY = "allio.liveCoach.enabled";

export function LiveCoachDock() {
  const call = useActiveCallAudio();
  // Docken vises først under et opkald (efter hydrering), så det er sikkert at læse valget her.
  const [enabled, setEnabled] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false; // privat vindue o.l. — standard: slukket
    }
  });

  const toggle = () => {
    setEnabled((v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      } catch {
        /* ignorér */
      }
      return !v;
    });
  };

  if (!call) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {enabled ? <LiveCoach micStream={call.mic} remoteStream={call.remote} leadId={call.leadId} active /> : null}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ${enabled ? "bg-emerald-700 text-white" : "border border-stone-300 bg-white text-stone-700"}`}
      >
        Live-coach: {enabled ? "til" : "fra"}
      </button>
    </div>
  );
}
