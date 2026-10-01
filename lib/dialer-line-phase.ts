export type DialerLinePhase = "ringing" | "talking";

/** Frossen fane / hul: kreditér højst 10 min pr. tick, så «vågnede dagen efter» ikke puster linjetid. */
export const MAX_LINE_OCCUPANCY_CREDIT_SECONDS = 10 * 60;

export function isDialerLinePhase(v: unknown): v is DialerLinePhase {
  return v === "ringing" || v === "talking";
}

export function linePhaseFromAgentStatus(status: string | null | undefined): DialerLinePhase | null {
  if (status === "ringing" || status === "talking") return status;
  return null;
}

/** WebRTC-strip / Power-telefon: connecting+ringing = ring, live = tale. */
export function linePhaseFromVoipStatus(status: string | null | undefined): DialerLinePhase | null {
  if (status === "live") return "talking";
  if (status === "ringing" || status === "connecting") return "ringing";
  return null;
}

export function occupancyDeltaSeconds(
  prevAt: Date | null | undefined,
  now: Date,
  maxSeconds: number = MAX_LINE_OCCUPANCY_CREDIT_SECONDS,
): number {
  if (!prevAt) return 0;
  const raw = Math.round((now.getTime() - prevAt.getTime()) / 1000);
  return Math.min(Math.max(0, raw), maxSeconds);
}

export function applyOccupancyCredit(params: {
  ringSeconds: number;
  talkLineSeconds: number;
  linePhase: string | null;
  lineLastSeenAt: Date | null;
  nextPhase: DialerLinePhase | null;
  now: Date;
  maxSeconds?: number;
}): { ringSeconds: number; talkLineSeconds: number; linePhase: string | null } {
  const credit = occupancyDeltaSeconds(params.lineLastSeenAt, params.now, params.maxSeconds);
  let ringSeconds = params.ringSeconds;
  let talkLineSeconds = params.talkLineSeconds;
  if (params.linePhase === "ringing") ringSeconds += credit;
  else if (params.linePhase === "talking") talkLineSeconds += credit;
  return { ringSeconds, talkLineSeconds, linePhase: params.nextPhase };
}
