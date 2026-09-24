/**
 * Ren dispatch-matematik til tests og server-side parallel dialer.
 */

/** Hard cap for predictive-dispatch (Power bruger kampagnens `powerMaxInFlight`). */
export const MAX_IN_FLIGHT_PER_CAMPAIGN = 50;

export function parseTelnyxOutboundChannelLimitFromEnv(raw: string | undefined): number | null {
  const t = raw?.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * Predictive: beregn hvor mange nye lead-opkald der må startes nu.
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

export type PowerDispatchLimit =
  | "none"
  | "no_ready_agents"
  | "target_reached"
  | "max_in_flight"
  | "channel_limit";

export type PowerDispatchPlanInput = {
  /** Klare sælgere (frisk heartbeat, WebRTC klar, ikke i efterbehandling). */
  readyAgents: number;
  /** Kampagnens linjer pr. klar sælger. */
  ratio: number;
  /** Drop-bremsen er aktiv → højst én linje pr. klar sælger. */
  brakeActive: boolean;
  /** Kampagnens loft for samtidige uforbundne lead-opkald. */
  maxInFlight: number;
  /** Kampagnens lead-ben uden tildelt sælger: reserveret, ringer eller besvaret (AMD). */
  unassignedInFlight: number;
  /** Delmængde af `unassignedInFlight`, der er ringet op men ikke besvaret (kan lægges på). */
  ringingUnanswered: number;
  /** Telnyx' udgående kanalgrænse for Call Control-appen (alle kampagner). null = ukendt. */
  channelLimit: number | null;
  /** PSTN-lead-ben der optager en kanal lige nu (alle kampagner, også forbundne). */
  channelsInUse: number;
};

export type PowerDispatchPlan = {
  effectiveRatio: number;
  /** Ønsket antal uforbundne lead-opkald i luften for kampagnen. */
  target: number;
  newCalls: number;
  /** Antal ringende (ubesvarede) opkald der skal lægges på, fordi kapaciteten er faldet. */
  cancelRinging: number;
  limitedBy: PowerDispatchLimit;
};

/**
 * Power Dialer: mål = klare sælgere × ratio (under kampagneloftet). Nye opkald = mål − uforbundne
 * i luften, begrænset af ledige Telnyx-kanaler. Er der flere ringende end målet (fx fordi en sælger
 * lige er forbundet), lægges overskuddet på i stedet for at risikere et menneske uden sælger.
 */
export function computePowerDispatchPlan(input: PowerDispatchPlanInput): PowerDispatchPlan {
  const ready = Math.max(0, Math.floor(input.readyAgents));
  const ratio = Math.max(1, input.ratio);
  const effectiveRatio = input.brakeActive ? 1 : ratio;
  const rawTarget = Math.floor(ready * effectiveRatio + 1e-9);
  const maxInFlight = Math.max(0, Math.floor(input.maxInFlight));
  const target = Math.min(rawTarget, maxInFlight);
  const inFlight = Math.max(0, Math.floor(input.unassignedInFlight));

  let newCalls = Math.max(0, target - inFlight);
  let limitedBy: PowerDispatchLimit = "none";
  if (ready === 0) {
    limitedBy = "no_ready_agents";
  } else if (rawTarget > maxInFlight && newCalls === 0) {
    limitedBy = "max_in_flight";
  } else if (newCalls === 0) {
    limitedBy = "target_reached";
  }

  if (input.channelLimit !== null && newCalls > 0) {
    const room = Math.max(0, input.channelLimit - Math.max(0, input.channelsInUse));
    if (room < newCalls) {
      newCalls = room;
      limitedBy = "channel_limit";
    }
  }

  const excess = Math.max(0, inFlight - target);
  const cancelRinging = Math.min(excess, Math.max(0, Math.floor(input.ringingUnanswered)));
  return { effectiveRatio, target, newCalls, cancelRinging, limitedBy };
}

export type DropBrakeState = {
  active: boolean;
  /** drops / (forbundne + drops) i vinduet, eller null uden data. */
  dropRate: number | null;
  sample: number;
};

/**
 * Drop-bremse: er andelen af menneske-svar uden sælger over loftet (og stikprøven stor nok),
 * ringes der kun med én linje pr. klar sælger, indtil raten er nede igen.
 */
export function computeDropBrake(params: {
  bridges: number;
  drops: number;
  maxDropRatePct: number;
  minSample: number;
}): DropBrakeState {
  const bridges = Math.max(0, params.bridges);
  const drops = Math.max(0, params.drops);
  const sample = bridges + drops;
  const dropRate = sample > 0 ? drops / sample : null;
  if (params.maxDropRatePct <= 0 || sample < params.minSample || dropRate === null) {
    return { active: false, dropRate, sample };
  }
  return { active: dropRate * 100 > params.maxDropRatePct, dropRate, sample };
}

/** Vælg de ældste ringende ben at lægge på (de er tættest på «intet svar» alligevel). */
export function pickRingingLegsToCancel<T extends { reservedAt: Date }>(legs: T[], count: number): T[] {
  if (count <= 0) return [];
  return [...legs].sort((a, b) => a.reservedAt.getTime() - b.reservedAt.getTime()).slice(0, count);
}
