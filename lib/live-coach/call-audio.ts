"use client";

/**
 * Fælles register for det aktive opkalds lydspor. Telefon-komponenterne (klik-for-at-ringe/predictive
 * i CampaignVoipStrip, power dialeren i PowerDialerPhone) melder deres samtale ind; live-coachen
 * læser herfra — så den er koblet til samtalen, ikke til opkaldstypen.
 */
import { useEffect, useSyncExternalStore } from "react";

export type CallAudio = { mic: MediaStream | null; remote: MediaStream };

const sources = new Map<string, CallAudio>();
const listeners = new Set<() => void>();
let snapshot: CallAudio | null = null;

function notify() {
  const last = [...sources.values()].at(-1) ?? null;
  if (last?.remote !== snapshot?.remote || last?.mic !== snapshot?.mic) snapshot = last;
  listeners.forEach((l) => l());
}

export function setCallAudio(id: string, audio: CallAudio | null): void {
  if (audio) sources.set(id, audio);
  else sources.delete(id);
  notify();
}

/** Melder et aktivt opkald ind (null = intet opkald); afmeldes automatisk ved unmount. */
export function useCallAudioPublisher(id: string, mic: MediaStream | null, remote: MediaStream | null, active: boolean): void {
  useEffect(() => {
    setCallAudio(id, active && remote ? { mic, remote } : null);
    return () => setCallAudio(id, null);
  }, [id, mic, remote, active]);
}

/** Det aktuelle opkalds lydspor (eller null). */
export function useActiveCallAudio(): CallAudio | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => null,
  );
}
