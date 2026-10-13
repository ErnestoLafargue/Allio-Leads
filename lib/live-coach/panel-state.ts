"use client";

/**
 * Om live-coach-panelet i højre side er åbent. Delt mellem knappen ved udfaldsbjælken, panelet og
 * hovedindholdet (som rykker til venstre, når panelet er åbent). Valget huskes i browseren.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "allio.liveCoach.enabled";
const listeners = new Set<() => void>();
let open: boolean | null = null;

function read(): boolean {
  if (open === null) {
    try {
      open = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      open = false; // privat vindue o.l. — standard: lukket
    }
  }
  return open;
}

export function setLiveCoachOpen(next: boolean): void {
  open = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignorér */
  }
  listeners.forEach((l) => l());
}

export function useLiveCoachOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => false,
  );
}
