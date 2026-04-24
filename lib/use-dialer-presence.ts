"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Presence-status fra agent-workspace til server-side parallel dialer.
 *
 * Hver 5 sek sendes en heartbeat med current status. Server upsert'er AgentSession
 * og returnerer:
 * - presence-stats (antal ledige agenter, in-flight opkald) til UI-visning
 * - assignedLead hvis dispatcheren har bridged et nyt lead til denne agent
 *
 * Når assignedLead.id ændrer sig → komponentens onAssignedLead-callback fyrer,
 * og workspace kan vælge at swappe lead.
 */

export type DialerPresenceStatus = "ready" | "ringing" | "talking" | "wrap_up" | "offline";

export type DialerPresenceStats = {
  /// Alle agent-sessioner i status "ready" (inkl. uden Telnyx-profil)
  ready: number;
  /// Klare agenter med både telnyxCredentialId og telnyxSipUsername — dem dispatcheren kan bruge
  readyForDispatch: number;
  ringing: number;
  talking: number;
  inFlightCalls: number;
};

export type AssignedLead = {
  id: string;
  companyName: string;
  phone: string;
  leadCallControlId: string | null;
  agentCallControlId: string | null;
};

export type UseDialerPresenceOptions = {
  /// Kampagne-id som agentens workspace er åbent i. Når null heartbeats sendes ikke.
  campaignId: string | null;
  /// Aktuel UI-status for agenten
  status: DialerPresenceStatus;
  /// Heartbeat-interval i ms (default 5000)
  intervalMs?: number;
  /// Triggers når serveren har tildelt et nyt lead via bridge
  onAssignedLead?: (lead: AssignedLead) => void;
  /// Hvis aktiveret: kald /api/dialer/dispatch parallel med presence (kun når status=ready)
  /// for at få serveren til at placere parallelle udgående opkald.
  enableDispatch?: boolean;
  /// Maks nye opkald pr. dispatch-kald (override af pacing — sjældent nødvendigt)
  dispatchMaxNewCalls?: number;
};

export function useDialerPresence(options: UseDialerPresenceOptions) {
  const {
    campaignId,
    status,
    intervalMs = 5000,
    onAssignedLead,
    enableDispatch = false,
    dispatchMaxNewCalls,
  } = options;

  const [stats, setStats] = useState<DialerPresenceStats | null>(null);
  const [sipReady, setSipReady] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const sipReadyRef = useRef<boolean | null>(null);

  // Track senest set assigned-leadId så vi kun kalder onAssignedLead ved ÆNDRING
  const lastAssignedRef = useRef<string | null>(null);
  const onAssignedRef = useRef(onAssignedLead);
  const statusRef = useRef(status);

  // Synk refs i useEffect (ikke under render) — React 19 advarer hvis vi muterer
  // refs direkte i komponentens body.
  useEffect(() => {
    onAssignedRef.current = onAssignedLead;
  }, [onAssignedLead]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    sipReadyRef.current = sipReady;
  }, [sipReady]);

  const sendHeartbeat = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await fetch("/api/dialer/agent/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, status: statusRef.current }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setLastError(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as {
        presence?: DialerPresenceStats;
        sipReady?: boolean;
        assignedLead?: AssignedLead | null;
      };
      if (data.presence) {
        const p = data.presence;
        setStats({
          ...p,
          readyForDispatch:
            typeof p.readyForDispatch === "number" ? p.readyForDispatch : p.ready,
        });
      }
      if (typeof data.sipReady === "boolean") {
        setSipReady(data.sipReady);
        sipReadyRef.current = data.sipReady;
      }
      setLastError(null);

      const newAssignedId = data.assignedLead?.id ?? null;
      if (newAssignedId && newAssignedId !== lastAssignedRef.current) {
        lastAssignedRef.current = newAssignedId;
        onAssignedRef.current?.(data.assignedLead!);
      } else if (!newAssignedId && lastAssignedRef.current) {
        lastAssignedRef.current = null;
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Heartbeat fejlede");
    }
  }, [campaignId]);

  const triggerDispatch = useCallback(async () => {
    if (!campaignId) return;
    if (statusRef.current !== "ready") return;
    // Parallel-dispatch kræver per-agent Telephony Credential + SIP-brugernavn i DB
    if (sipReadyRef.current === false) return;
    try {
      const body: Record<string, unknown> = { campaignId };
      if (typeof dispatchMaxNewCalls === "number") body.maxNewCalls = dispatchMaxNewCalls;
      await fetch("/api/dialer/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* dispatch-fejl er ikke fatale — næste heartbeat prøver igen */
    }
  }, [campaignId, dispatchMaxNewCalls]);

  useEffect(() => {
    if (!campaignId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (cancelled) return;
      await sendHeartbeat();
      if (enableDispatch) await triggerDispatch();
    };

    void tick();
    timer = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [campaignId, intervalMs, sendHeartbeat, triggerDispatch, enableDispatch]);

  // Når komponenten unmount'er sender vi "offline" — så slipper agenten ud af pacing
  useEffect(() => {
    return () => {
      if (!campaignId) return;
      // Bedst-effort — beacon API klarer hangup-på-vej-væk
      try {
        const data = JSON.stringify({ campaignId, status: "offline" });
        if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
          const blob = new Blob([data], { type: "application/json" });
          navigator.sendBeacon("/api/dialer/agent/presence", blob);
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
  }, [campaignId]);

  return { stats, sipReady, lastError, refresh: sendHeartbeat };
}
