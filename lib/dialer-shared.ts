/**
 * Delte typer + helpers til server-side parallel dialer (Power Dialer / Predictive).
 *
 * Bruges af:
 * - app/api/telnyx/webhooks/call-events/route.ts (modtager events fra Telnyx)
 * - app/api/dialer/dispatch/route.ts (placerer parallelle udgående opkald)
 * - app/api/dialer/agent/presence/route.ts (heartbeat + status)
 * - lib/dialer-bridge.ts (bridge-logik: AMD=human → ring agent → bridge)
 */

import { Buffer } from "node:buffer";

/**
 * Kompakt JSON pakket ind i client_state og base64-kodet.
 * Telnyx returnerer det uændret på alle webhooks så vi kan korrelere
 * et call_control_id med vores lead/agent/dispatch-context.
 */
export type DialerClientStateV1 = {
  v: 1;
  kind: "lead" | "agent" | "manual";
  campaignId: string;
  leadId?: string;
  userId?: string;
  linkedCallControlId?: string;
  dispatchId?: string;
};

/** Lead-leg fra server-side dispatch — udvidet kontekst til logs, recording og idempotens. */
export type DialerClientStateLeadV2 = {
  v: 2;
  kind: "lead";
  campaignId: string;
  leadId: string;
  queueItemId: string;
  batchId: string;
  dialMode: "POWER_DIALER" | "PREDICTIVE";
  phoneE164: string;
};

export type DialerClientState = DialerClientStateV1 | DialerClientStateLeadV2;

export function encodeDialerClientState(state: DialerClientState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64");
}

function parseV1(parsed: Record<string, unknown>): DialerClientStateV1 | null {
  if (typeof parsed.campaignId !== "string" || parsed.campaignId.length === 0) return null;
  if (parsed.kind !== "lead" && parsed.kind !== "agent" && parsed.kind !== "manual") return null;
  return parsed as DialerClientStateV1;
}

function parseV2Lead(parsed: Record<string, unknown>): DialerClientStateLeadV2 | null {
  if (parsed.kind !== "lead") return null;
  if (typeof parsed.campaignId !== "string" || parsed.campaignId.length === 0) return null;
  if (typeof parsed.leadId !== "string" || parsed.leadId.length === 0) return null;
  if (typeof parsed.queueItemId !== "string" || parsed.queueItemId.length === 0) return null;
  if (typeof parsed.batchId !== "string" || parsed.batchId.length === 0) return null;
  if (parsed.dialMode !== "POWER_DIALER" && parsed.dialMode !== "PREDICTIVE") return null;
  if (typeof parsed.phoneE164 !== "string" || parsed.phoneE164.length === 0) return null;
  return parsed as DialerClientStateLeadV2;
}

export function decodeDialerClientState(raw: string | null | undefined): DialerClientState | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const v = parsed.v;
    if (v === 1) return parseV1(parsed);
    if (v === 2) return parseV2Lead(parsed);
    return null;
  } catch {
    return null;
  }
}

/// Hvor længe en heartbeat anses som "frisk". Kan justeres pr. miljø.
export const PRESENCE_FRESH_WINDOW_MS = 30_000;

/// Hvor længe et reservert lead må sidde i køen før det auto-frigøres ved cleanup.
export const QUEUE_RESERVATION_TTL_MS = 90_000;

/**
 * Kortvarige idempotency-cookies for webhook-events. Telnyx kan i sjældne tilfælde
 * sende samme event 2-3 gange (retries). Vi gemmer event-id i DialerCallLog.rawEventsJson
 * og dropper duplikater.
 */
export type TelnyxWebhookEnvelope = {
  data?: {
    event_type?: string;
    id?: string;
    occurred_at?: string;
    payload?: TelnyxWebhookPayload;
  };
  meta?: { attempt?: number; delivered_to?: string };
};

export type TelnyxWebhookPayload = {
  call_control_id?: string;
  call_session_id?: string;
  call_leg_id?: string;
  from?: string;
  to?: string;
  direction?: string;
  client_state?: string;
  result?: string;
  cause?: string;
  hangup_cause?: string;
  hangup_source?: string;
  recording_urls?: { mp3?: string; wav?: string };
  state?: string;
  [key: string]: unknown;
};

export function pickCallControlId(p: TelnyxWebhookPayload | undefined): string | null {
  if (!p) return null;
  // Nogle Telnyx-events (bl.a. visse recording/hangup varianter) kan returnere
  // call_leg_id uden et udfyldt call_control_id. Vi bruger derfor begge felter
  // som korrelationsnøgle mod DialerCallLog.callControlId.
  const callControlId = p.call_control_id;
  if (typeof callControlId === "string" && callControlId.length > 0) return callControlId;
  const callLegId = p.call_leg_id;
  if (typeof callLegId === "string" && callLegId.length > 0) return callLegId;
  return null;
}

export function appendRawEvent(
  existingJson: string | null | undefined,
  event: { type: string; id?: string; at: string; payload: unknown },
): string {
  let arr: unknown[] = [];
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }
  }
  arr.push(event);
  // Hold kun de seneste 50 events for at undgå at rækken vokser ubegrænset.
  if (arr.length > 50) arr = arr.slice(-50);
  return JSON.stringify(arr);
}

export function isDuplicateEvent(
  existingJson: string | null | undefined,
  eventId: string | undefined,
): boolean {
  if (!eventId || !existingJson) return false;
  try {
    const parsed = JSON.parse(existingJson);
    if (!Array.isArray(parsed)) return false;
    return parsed.some((e) =>
      e && typeof e === "object" && (e as { id?: string }).id === eventId,
    );
  } catch {
    return false;
  }
}
