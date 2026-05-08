/**
 * Ren dispatch-matematik til tests og server-side parallel dialer.
 */

export const POWER_DIALER_LEADS_PER_READY_AGENT = 5;

/** Matcher `MAX_IN_FLIGHT_PER_CAMPAIGN` i dispatch-route (éns for import i tests). */
export const MAX_IN_FLIGHT_PER_CAMPAIGN = 50;

export function parseTelnyxOutboundChannelLimitFromEnv(raw: string | undefined): number | null {
  const t = raw?.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * Beregn hvor mange nye lead-opkald der må startes nu.
 * `inFlightCalls` skal matche den samme tælling som i dispatch (typisk outbound-lead ikke afsluttet).
 */
export function computeDispatchNewCallsNeeded(params: {
  readyCount: number;
  ratio: number;
  inFlightCalls: number;
  maxInFlightCap?: number;
  maxNewCallsOverride: number | null;
  channelLimit: number | null;
}): { targetTotal: number; newCallsNeeded: number } {
  const maxCap = params.maxInFlightCap ?? MAX_IN_FLIGHT_PER_CAMPAIGN;
  const targetTotal = Math.min(Math.max(0, Math.floor(params.readyCount * params.ratio)), maxCap);
  let newCallsNeeded = Math.max(0, targetTotal - params.inFlightCalls);
  if (params.maxNewCallsOverride !== null) {
    newCallsNeeded = Math.min(newCallsNeeded, params.maxNewCallsOverride);
  }
  if (params.channelLimit !== null) {
    const headroom = Math.max(0, params.channelLimit - params.inFlightCalls);
    newCallsNeeded = Math.min(newCallsNeeded, headroom);
  }
  return { targetTotal, newCallsNeeded };
}
