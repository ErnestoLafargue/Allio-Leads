"use client";

import { useCallback, useEffect, useState } from "react";
import { DESKTOP_CLOCK_HEADER, isDesktopComputer } from "@/lib/desktop-computer";
import {
  TIME_CLOCK_CHANGED_EVENT,
  liveOpenSeconds,
  liveTodaySeconds,
  notifyTimeClockChanged,
  type TimeClockAction,
  type TimeClockStatus,
} from "@/lib/time-clock";

let cachedStatus: TimeClockStatus | null = null;

export function useTimeClock() {
  const [status, setStatus] = useState<TimeClockStatus | null>(cachedStatus);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const applyStatus = useCallback((next: TimeClockStatus) => {
    cachedStatus = next;
    setStatus(next);
    setNowMs(Date.now());
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/time-clock");
      if (!res.ok) {
        setError("Kunne ikke hente stempling");
        return;
      }
      const json = (await res.json()) as TimeClockStatus;
      applyStatus(json);
      setError(null);
    } catch {
      setError("Kunne ikke hente stempling");
    }
  }, [applyStatus]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    window.addEventListener(TIME_CLOCK_CHANGED_EVENT, onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(TIME_CLOCK_CHANGED_EVENT, onFocus);
    };
  }, [reload]);

  useEffect(() => {
    if (!status?.clockedIn) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [status?.clockedIn]);

  const punch = useCallback(async (action: TimeClockAction) => {
    setBusy(true);
    setError(null);
    try {
      if (!isDesktopComputer()) {
        setError("Stempling kan kun ske fra en computer på kontoret.");
        return;
      }
      const res = await fetch("/api/time-clock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [DESKTOP_CLOCK_HEADER]: "1",
        },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => null)) as
        | (TimeClockStatus & { error?: string })
        | null;
      if (!res.ok) {
        setError(json?.error ?? "Kunne ikke stemple");
        return;
      }
      if (json) applyStatus(json);
      notifyTimeClockChanged();
    } catch {
      setError("Kunne ikke stemple");
    } finally {
      setBusy(false);
    }
  }, [applyStatus]);

  const openSeconds = liveOpenSeconds(status?.openEntry, nowMs);
  const todaySeconds = status ? liveTodaySeconds(status, nowMs) : 0;

  return { status, error, busy, punch, reload, openSeconds, todaySeconds, nowMs };
}
