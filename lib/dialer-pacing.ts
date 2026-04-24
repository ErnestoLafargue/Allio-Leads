/**
 * Mål-abandonment-rate for predictive udringning (industrinorm ~3 %).
 * Bruger vi til at dække gående sager til telefon, mens vi minimerer "dead air".
 */
export const DIALER_ABANDON_TARGET = 0.03;

const RATIO_MIN = 1.0;
const RATIO_MAX = 3.0;
const RATIO_DEFAULT_PREDICTIVE = 2.0;
/** Mindst dette antal afsluttede hændelser (bridge + no_agent) i vinduet før ratio justeres væk fra default — undgår voldsomme sving de første minutter. */
export const MIN_PACING_SAMPLE_BEFORE_TUNE = 25;
/** Rullende vindue for aggregering af success vs. abandon (ms). */
export const PACING_WINDOW_MS = 60 * 60 * 1000; // 1 time

type DialerPacingDb = {
  dialerCallLog: {
    count: (args: {
      where: Record<string, unknown>;
    }) => Promise<number>;
  };
};

/**
 * Tæl bridgede lead-opkald (vellykket kobling til agent) i vinduet.
 */
export async function countBridgesInWindow(
  db: DialerPacingDb,
  params: { campaignId: string; since: Date },
): Promise<number> {
  return db.dialerCallLog.count({
    where: {
      campaignId: params.campaignId,
      direction: "outbound-lead",
      bridgedAt: { gte: params.since },
    },
  });
}

/**
 * Tæl opkald hvor menneske svarede men ingen ledig agent var (predictive over-pacing).
 */
export async function countNoAgentAbandonsInWindow(
  db: DialerPacingDb,
  params: { campaignId: string; since: Date },
): Promise<number> {
  return db.dialerCallLog.count({
    where: {
      campaignId: params.campaignId,
      direction: "outbound-lead",
      endedAt: { gte: params.since },
      hangupCause: "no_agent_available",
    },
  });
}

/**
 * Tæl AMD=machine (voicemail) i vinduet — til dashboard.
 */
export async function countAmdMachineInWindow(
  db: DialerPacingDb,
  params: { campaignId: string; since: Date },
): Promise<number> {
  return db.dialerCallLog.count({
    where: {
      campaignId: params.campaignId,
      direction: "outbound-lead",
      endedAt: { gte: params.since },
      amdResult: { in: ["machine", "fax"] },
    },
  });
}

/**
 * Forudsigende pacing-ratio: justerer antal parallelle udgående opkald pr. klar agent
 * så den observerede abandon-rate (no-agent) går mod `DIALER_ABANDON_TARGET` (~3 %).
 *
 *   ratio = clamp( R₀ + (target - actual) * k, RATIO_MIN, RATIO_MAX )
 *
 * R₀ = 2.0, k = 10 (jævn respons uden voldsomme sving)
 *
 * Før der er nok data (0 bridges og 0 abandons) bruges RATIO_DEFAULT_PREDICTIVE.
 */
export function predictivePacingRatioFromRates(params: {
  bridgeCount: number;
  noAgentAbandonCount: number;
}): { ratio: number; abandonRate: number | null; sampleSize: number } {
  const b = params.bridgeCount;
  const a = params.noAgentAbandonCount;
  const n = a + b;
  if (n === 0) {
    return {
      ratio: RATIO_DEFAULT_PREDICTIVE,
      abandonRate: null,
      sampleSize: 0,
    };
  }
  const abandonRate = a / n;
  const raw = RATIO_DEFAULT_PREDICTIVE + (DIALER_ABANDON_TARGET - abandonRate) * 10;
  const ratio = Math.min(RATIO_MAX, Math.max(RATIO_MIN, raw));
  return { ratio, abandonRate, sampleSize: n };
}

/**
 * Mål: total in-flight = floor(readyAgents * ratio) for PREDICTIVE.
 * POWER_DIALER: fast 1.0 (én dial pr. klar agent ad gangen).
 */
export async function getTargetPacingRatioAndStats(
  db: DialerPacingDb,
  params: { campaignId: string; dialMode: "PREDICTIVE" | "POWER_DIALER" | string },
): Promise<{
  ratio: number;
  abandonRate: number | null;
  sampleSize: number;
  bridgeCount: number;
  noAgentAbandonCount: number;
  /** true når vi endnu ikke har nok data — ratio holdes på default (2.0) */
  heldLowSample: boolean;
}> {
  const since = new Date(Date.now() - PACING_WINDOW_MS);
  if (params.dialMode !== "PREDICTIVE") {
    return {
      ratio: 1.0,
      abandonRate: null as number | null,
      sampleSize: 0,
      bridgeCount: 0,
      noAgentAbandonCount: 0,
      heldLowSample: false,
    };
  }
  const [bridgeCount, noAgentAbandonCount] = await Promise.all([
    countBridgesInWindow(db, { campaignId: params.campaignId, since }),
    countNoAgentAbandonsInWindow(db, { campaignId: params.campaignId, since }),
  ]);
  const n = bridgeCount + noAgentAbandonCount;
  if (n < MIN_PACING_SAMPLE_BEFORE_TUNE) {
    return {
      ratio: RATIO_DEFAULT_PREDICTIVE,
      abandonRate: n > 0 ? noAgentAbandonCount / n : null,
      sampleSize: n,
      bridgeCount,
      noAgentAbandonCount,
      heldLowSample: true,
    };
  }
  const { ratio, abandonRate, sampleSize } = predictivePacingRatioFromRates({
    bridgeCount,
    noAgentAbandonCount,
  });
  return {
    ratio,
    abandonRate,
    sampleSize,
    bridgeCount,
    noAgentAbandonCount,
    heldLowSample: false,
  };
}
