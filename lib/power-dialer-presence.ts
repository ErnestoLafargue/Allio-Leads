/**
 * Serverstyret sælgerstatus for Power Dialer.
 *
 * Klienten rapporterer hensigt (klar/pause) og fakta (lead åbent, samtale, WebRTC klar). Serveren
 * ejer «ringing» (reserveret) og «talking» — et heartbeat kan aldrig sætte en reserveret sælger
 * tilbage til klar. Efterbehandling varer, så længe et lead er åbent, plus pause mellem opkald.
 */

import type { PowerPauseMode } from "@/lib/power-dialer-settings";
import { powerDrainWindowMs } from "@/lib/power-dialer-constants";

export const POWER_AGENT_STATUSES = [
  "ready",
  "ringing",
  "talking",
  "wrap_up",
  "draining",
  "paused",
  "offline",
] as const;

export type PowerAgentStatus = (typeof POWER_AGENT_STATUSES)[number];

export type PowerAgentServerState = {
  status: string;
  readySince: Date | null;
  reservedAt: Date | null;
  wrapUpUntil: Date | null;
  drainUntil: Date | null;
  clientInstanceId: string | null;
  lastHeartbeat: Date | null;
};

export type PowerPresenceIntent = "ready" | "pause";

export type PowerPresenceReport = {
  clientInstanceId: string;
  intent: PowerPresenceIntent;
  leadOpen: boolean;
  lineLive: boolean;
  webrtcReady: boolean;
  /** Første heartbeat efter «Start» (eller «Genoptag her»): overtag sessionen. */
  takeover: boolean;
  /** «Klar nu»: spring resten af pausen mellem opkald over. */
  skipWrapUp: boolean;
};

export type PowerPresenceNext = {
  status: PowerAgentStatus;
  readySince: Date | null;
  reservedAt: Date | null;
  wrapUpUntil: Date | null;
  drainUntil: Date | null;
  webrtcReady: boolean;
  clientInstanceId: string;
};

export type PowerPresenceDecision =
  | { superseded: true }
  | { superseded: false; next: PowerPresenceNext; releasedReservation: boolean };

export function reducePowerPresence(
  prev: PowerAgentServerState | null,
  report: PowerPresenceReport,
  settings: { wrapUpSeconds: number; ringTimeoutSecs: number; pauseMode: PowerPauseMode },
  now: Date,
  opts: { freshWindowMs: number; reservationStaleMs: number },
): PowerPresenceDecision {
  const nowMs = now.getTime();

  if (
    prev &&
    prev.clientInstanceId &&
    prev.clientInstanceId !== report.clientInstanceId &&
    !report.takeover
  ) {
    const ownerFresh =
      prev.lastHeartbeat !== null && nowMs - prev.lastHeartbeat.getTime() <= opts.freshWindowMs;
    if (ownerFresh) return { superseded: true };
  }

  const prevStatus = (prev?.status ?? "offline") as PowerAgentStatus | string;
  let readySince = prev?.readySince ?? null;
  let reservedAt = prev?.reservedAt ?? null;
  let wrapUpUntil = prev?.wrapUpUntil ?? null;
  let drainUntil = prev?.drainUntil ?? null;
  let releasedReservation = false;

  const done = (status: PowerAgentStatus): PowerPresenceDecision => ({
    superseded: false,
    releasedReservation,
    next: {
      status,
      readySince,
      reservedAt: status === "ringing" ? reservedAt : null,
      wrapUpUntil,
      drainUntil,
      webrtcReady: report.webrtcReady,
      clientInstanceId: report.clientInstanceId,
    },
  });

  // 1) Serverstyrede optaget-tilstande.
  if (report.lineLive) {
    return done("talking");
  }
  if (prevStatus === "ringing") {
    const stale = !reservedAt || nowMs - reservedAt.getTime() > opts.reservationStaleMs;
    if (!stale) return done("ringing");
    releasedReservation = true;
    reservedAt = null;
  }
  let inWrapUp = prevStatus === "wrap_up";
  if (prevStatus === "talking") {
    inWrapUp = true;
    wrapUpUntil = null;
  }

  // 2) Efterbehandling: aldrig klar mens et lead er åbent.
  if (report.leadOpen) {
    wrapUpUntil = null;
    return done("wrap_up");
  }
  if (inWrapUp) {
    if (!wrapUpUntil) wrapUpUntil = new Date(nowMs + Math.max(0, settings.wrapUpSeconds) * 1000);
    if (report.skipWrapUp) wrapUpUntil = now;
    if (nowMs < wrapUpUntil.getTime()) return done("wrap_up");
    wrapUpUntil = null;
  } else if (report.skipWrapUp) {
    wrapUpUntil = null;
  }

  // 3) Fri: følg sælgerens hensigt.
  if (report.intent === "pause") {
    readySince = null;
    if (settings.pauseMode === "HANGUP_RINGING" || prevStatus === "paused") {
      drainUntil = null;
      return done("paused");
    }
    if (!drainUntil) drainUntil = new Date(nowMs + powerDrainWindowMs(settings.ringTimeoutSecs));
    if (nowMs < drainUntil.getTime()) return done("draining");
    drainUntil = null;
    return done("paused");
  }

  drainUntil = null;
  if (prevStatus !== "ready" || !readySince) readySince = now;
  return done("ready");
}

/** Kan sælgeren tælle med, når dispatch beregner nye opkald? */
export function isPowerAgentDialable(
  s: { status: string; webrtcReady: boolean; lastHeartbeat: Date; wrapUpUntil: Date | null },
  now: Date,
  freshWindowMs: number,
): boolean {
  if (s.status !== "ready" || !s.webrtcReady) return false;
  if (now.getTime() - s.lastHeartbeat.getTime() > freshWindowMs) return false;
  return !s.wrapUpUntil || s.wrapUpUntil.getTime() <= now.getTime();
}
