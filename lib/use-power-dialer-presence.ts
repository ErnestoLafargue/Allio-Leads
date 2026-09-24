"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssignedLead } from "@/lib/use-dialer-presence";

/**
 * Presence + dispatch for Power Dialer. Klienten rapporterer hensigt og fakta; serveren bestemmer
 * status (klar / reserveret / samtale / efterbehandling / pause). Dispatch kaldes kun, når serveren
 * siger «klar», og WebRTC er forbundet.
 */

export type PowerServerStatus =
  | "ready"
  | "ringing"
  | "talking"
  | "wrap_up"
  | "draining"
  | "paused"
  | "offline";

export type PowerCampaignStatsDto = {
  ready: number;
  readyNotConnected: number;
  ringing: number;
  talking: number;
  wrapUp: number;
  paused: number;
  inFlight: number;
  ringingLeads: number;
  channelsInUse: number;
  channelLimit: number | null;
  brakeActive: boolean;
  dropRate: number | null;
  dropSample: number;
  target: number;
};

export type PowerServerState = {
  status: PowerServerStatus;
  superseded: boolean;
  wrapUpUntil: string | null;
  drainUntil: string | null;
  sipReady: boolean;
  stats: PowerCampaignStatsDto | null;
  settings: {
    dialRatio: number;
    ringTimeoutSecs: number;
    wrapUpSeconds: number;
    pauseMode: "DRAIN" | "HANGUP_RINGING";
    amdEnabled: boolean;
  } | null;
};

export type PowerDispatchSnapshot = {
  code: string;
  dispatched: number;
  inFlight: number;
  target: number;
  ready: number;
  limitedBy: string;
  channelLimit: number | null;
  channelsInUse: number;
  brakeActive: boolean;
  nextEligibleAt: string | null;
  at: number;
};

type Options = {
  /** null = inaktiv (ingen heartbeats). */
  campaignId: string | null;
  intent: "ready" | "pause";
  leadOpen: boolean;
  lineLive: boolean;
  webrtcReady: boolean;
  onAssignedLead: (lead: AssignedLead) => void | Promise<void>;
  intervalMs?: number;
};

function newInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function usePowerDialerPresence(options: Options) {
  const { campaignId, intervalMs = 5000 } = options;
  const [server, setServer] = useState<PowerServerState | null>(null);
  const [lastDispatch, setLastDispatch] = useState<PowerDispatchSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const instanceIdRef = useRef<string>("");
  if (!instanceIdRef.current) instanceIdRef.current = newInstanceId();
  const takeoverRef = useRef(true);
  const skipWrapUpRef = useRef(false);
  const supersededRef = useRef(false);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const lastAssignedRef = useRef<string | null>(null);

  const reportRef = useRef(options);
  useEffect(() => {
    reportRef.current = options;
  });

  const tick = useCallback(async () => {
    if (!campaignId) return;
    if (inFlightRef.current) {
      rerunRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      do {
        rerunRef.current = false;
        if (supersededRef.current && !takeoverRef.current) return;
        const r = reportRef.current;
        const takeover = takeoverRef.current;
        const skipWrapUp = skipWrapUpRef.current;
        const res = await fetch("/api/dialer/agent/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            power: {
              clientInstanceId: instanceIdRef.current,
              intent: r.intent,
              leadOpen: r.leadOpen,
              lineLive: r.lineLive,
              webrtcReady: r.webrtcReady,
              takeover,
              skipWrapUp,
            },
          }),
        });
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!res.ok || !data) {
          setError(typeof data?.error === "string" ? data.error : `Presence fejlede (HTTP ${res.status})`);
          return;
        }
        setError(null);
        takeoverRef.current = false;
        if (skipWrapUp) skipWrapUpRef.current = false;

        if (data.superseded === true) {
          supersededRef.current = true;
          setServer((prev) => ({
            status: (typeof data.status === "string" ? data.status : "offline") as PowerServerStatus,
            superseded: true,
            wrapUpUntil: null,
            drainUntil: null,
            sipReady: prev?.sipReady ?? true,
            stats: prev?.stats ?? null,
            settings: prev?.settings ?? null,
          }));
          return;
        }
        supersededRef.current = false;
        const status = (typeof data.status === "string" ? data.status : "offline") as PowerServerStatus;
        const next: PowerServerState = {
          status,
          superseded: false,
          wrapUpUntil: typeof data.wrapUpUntil === "string" ? data.wrapUpUntil : null,
          drainUntil: typeof data.drainUntil === "string" ? data.drainUntil : null,
          sipReady: data.sipReady !== false,
          stats: (data.stats as PowerCampaignStatsDto | undefined) ?? null,
          settings: (data.settings as PowerServerState["settings"] | undefined) ?? null,
        };
        setServer(next);

        const assigned = (data.assignedLead as AssignedLead | null | undefined) ?? null;
        if (assigned?.id && assigned.id !== lastAssignedRef.current) {
          lastAssignedRef.current = assigned.id;
          await Promise.resolve(reportRef.current.onAssignedLead(assigned));
        } else if (!assigned) {
          lastAssignedRef.current = null;
        }

        const latest = reportRef.current;
        if (status === "ready" && latest.webrtcReady && latest.intent === "ready" && !latest.leadOpen) {
          const dres = await fetch("/api/dialer/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId }),
          }).catch(() => null);
          const djson = dres ? ((await dres.json().catch(() => null)) as Record<string, unknown> | null) : null;
          if (djson && typeof djson.code === "string") {
            setLastDispatch({
              code: djson.code,
              dispatched: Number(djson.dispatched) || 0,
              inFlight: Number(djson.inFlight) || 0,
              target: Number(djson.target) || 0,
              ready: Number(djson.ready) || 0,
              limitedBy: typeof djson.limitedBy === "string" ? djson.limitedBy : "none",
              channelLimit: typeof djson.channelLimit === "number" ? djson.channelLimit : null,
              channelsInUse: Number(djson.channelsInUse) || 0,
              brakeActive: djson.brakeActive === true,
              nextEligibleAt: typeof djson.nextEligibleAt === "string" ? djson.nextEligibleAt : null,
              at: Date.now(),
            });
          }
        }
      } while (rerunRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Presence fejlede");
    } finally {
      inFlightRef.current = false;
    }
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => clearInterval(timer);
  }, [campaignId, intervalMs, tick]);

  // Luk sessionen, når siden forlades (kun denne fane — andre faners sessioner røres ikke).
  useEffect(() => {
    if (!campaignId) return;
    const instanceId = instanceIdRef.current;
    const sendOffline = () => {
      try {
        const data = JSON.stringify({ campaignId, power: { clientInstanceId: instanceId, intent: "offline" } });
        if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
          navigator.sendBeacon("/api/dialer/agent/presence", new Blob([data], { type: "application/json" }));
        } else {
          void fetch("/api/dialer/agent/presence", {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: data,
          });
        }
      } catch {
        /* no-op */
      }
    };
    window.addEventListener("pagehide", sendOffline);
    return () => {
      window.removeEventListener("pagehide", sendOffline);
      sendOffline();
    };
  }, [campaignId]);

  const refresh = useCallback(() => {
    void tick();
  }, [tick]);

  const skipWrapUp = useCallback(() => {
    skipWrapUpRef.current = true;
    void tick();
  }, [tick]);

  const takeOver = useCallback(() => {
    takeoverRef.current = true;
    supersededRef.current = false;
    void tick();
  }, [tick]);

  return { server, lastDispatch, error, refresh, skipWrapUp, takeOver };
}
