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
export type DialerClientState = {
  /// Versionsnummer — bumpes hvis schema ændres så gamle states kan ignoreres.
  v: 1;
  /// "lead" = udgående mod et lead, "agent" = originate til agent SIP, "manual" = klick-til-call
  kind: "lead" | "agent" | "manual";
  campaignId: string;
  /// Lead'et der ringes til (kun ved kind=lead/manual)
  leadId?: string;
  /// Agent der har bedt om opkaldet (kun ved kind=manual) eller agent der bridges til (kind=agent)
  userId?: string;
  /// Den anden legs call_control_id når kind=agent (lead'et vi skal bridge til)
  linkedCallControlId?: string;
  /// Dispatcher-batch-id, hjælp til at gruppere events i logs/admin
  dispatchId?: string;
};

export function encodeDialerClientState(state: DialerClientState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64");
}

export function decodeDialerClientState(raw: string | null | undefined): DialerClientState | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<DialerClientState>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.campaignId !== "string" || parsed.campaignId.length === 0) return null;
    if (parsed.kind !== "lead" && parsed.kind !== "agent" && parsed.kind !== "manual") return null;
    return parsed as DialerClientState;
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
