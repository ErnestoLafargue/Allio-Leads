"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const HEARTBEAT_MS = 60_000;

/**
 * Pinger /api/presence/heartbeat mens fanen er synlig, så login-tid (og
 * dialer-tid når man står på en kampagnes arbejdsside) akkumuleres pr. dag
 * til scoreboardet og Plecto-eksporten. Renderer intet.
 */
export function PresenceHeartbeat() {
  const pathname = usePathname();
  const campaignId = pathname?.match(/^\/kampagner\/([^/]+)\/arbejd(?:\/|$)/)?.[1] ?? null;

  useEffect(() => {
    let cancelled = false;
    const beat = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {
        /* presence er best-effort — må aldrig forstyrre UI */
      });
    };

    beat();
    const intervalId = window.setInterval(beat, HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [campaignId]);

  return null;
}
