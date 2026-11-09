"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { callActivityForDay, type CallHistory } from "./call-activity";

const REFRESH_MS = 60_000;

/** Brugeren hvis FlowZone der vises (admins kan skifte til en anden end sig selv). */
export const FlowZoneUserContext = createContext<string>("");

/**
 * Opkaldshistorikken hentes én gang pr. bruger og deles af hele FlowZone (også når man skifter fane),
 * så dagskift regnes ud i browseren uden at vente på serveren. Den opdateres hvert minut.
 */
type Entry = {
  cached: CallHistory | null;
  inflight: Promise<CallHistory> | null;
  lastLoaded: number;
  listeners: Set<(h: CallHistory | null, error: string | null) => void>;
};
const entries = new Map<string, Entry>();

const entryFor = (userId: string) => {
  let entry = entries.get(userId);
  if (!entry) {
    entry = { cached: null, inflight: null, lastLoaded: 0, listeners: new Set() };
    entries.set(userId, entry);
  }
  return entry;
};

export function loadCallHistory(userId: string, force = false): Promise<CallHistory> | null {
  const entry = entryFor(userId);
  if (entry.inflight) return entry.inflight;
  if (!force && entry.cached && Date.now() - entry.lastLoaded < REFRESH_MS) return null;
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  entry.inflight = fetch(`/api/flowzone/call-activity${query}`)
    .then(async (res) => {
      if (!res.ok) throw new Error();
      entry.cached = (await res.json()) as CallHistory;
      entry.lastLoaded = Date.now();
      entry.listeners.forEach((l) => l(entry.cached, null));
      return entry.cached;
    })
    .catch((e) => {
      if (!entry.cached) entry.listeners.forEach((l) => l(null, "Kunne ikke hente opkald"));
      throw e;
    })
    .finally(() => {
      entry.inflight = null;
    });
  entry.inflight.catch(() => {});
  return entry.inflight;
}

/** Holder den valgte brugers historik frisk, mens FlowZone er åben. */
export function useCallHistory() {
  const userId = useContext(FlowZoneUserContext);
  const [state, setState] = useState<{ userId: string; history: CallHistory | null; error: string | null }>(() => ({
    userId,
    history: entryFor(userId).cached,
    error: null,
  }));

  useEffect(() => {
    const entry = entryFor(userId);
    const listener = (h: CallHistory | null, err: string | null) =>
      setState((prev) => ({ userId, history: h ?? (prev.userId === userId ? prev.history : null), error: err }));
    entry.listeners.add(listener);
    void loadCallHistory(userId);
    const timer = window.setInterval(() => void loadCallHistory(userId, true), REFRESH_MS);
    return () => {
      entry.listeners.delete(listener);
      window.clearInterval(timer);
    };
  }, [userId]);

  // Lige efter et brugerskift: brug det der allerede er hentet for den nye bruger — aldrig den forriges tal
  if (state.userId !== userId) return { history: entryFor(userId).cached, error: null };
  return { history: state.history, error: state.error };
}

/** Opkald pr. kvarter for dagen + gennemsnit — regnes ud lokalt ud fra historikken. */
export function useCallActivity(dayKey: string) {
  const { history, error } = useCallHistory();
  const data = useMemo(() => (history ? callActivityForDay(history, dayKey) : null), [history, dayKey]);
  return { data, history, error };
}
