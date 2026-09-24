/**
 * Rene beslutninger for Power Dialer: hvad sker der med et lead-opkald efter AMD eller hangup,
 * og hvilken effekt det har på leadet (udfald, kontaktforsøg, hvornår det må ringes op igen).
 */

import type { AmdInternalResult } from "@/lib/telnyx-amd-result";
import type { PowerAmdUncertainAction } from "@/lib/power-dialer-settings";
import { POWER_INVALID_NUMBER_COOLDOWN_MS } from "@/lib/power-dialer-constants";

export const POWER_RESOLUTIONS = [
  "CONNECTED",
  "NO_ANSWER",
  "INVALID_NUMBER",
  "VOICEMAIL",
  "AMD_UNCERTAIN_REQUEUE",
  "DROP_NO_AGENT",
  "DROP_LEAD_HUNGUP",
  "CANCELLED_OVERDIAL",
  "TECHNICAL",
] as const;

export type PowerResolution = (typeof POWER_RESOLUTIONS)[number];

/** Udfald der tæller som «drop» i drop-raten (et menneske svarede, men blev ikke forbundet). */
export const POWER_DROP_RESOLUTIONS: readonly PowerResolution[] = ["DROP_NO_AGENT"];

export type PowerAmdAction = "CONNECT" | "VOICEMAIL" | "REQUEUE_UNCERTAIN";

export function decidePowerAmdAction(
  amd: AmdInternalResult,
  uncertainAction: PowerAmdUncertainAction,
): PowerAmdAction {
  if (amd === "human") return "CONNECT";
  if (amd === "machine" || amd === "fax") return "VOICEMAIL";
  return uncertainAction === "CONNECT" ? "CONNECT" : "REQUEUE_UNCERTAIN";
}

/** Telnyx hangup_cause for ubesvarede opkald, der betyder «ingen tog den». */
const NO_ANSWER_CAUSES = new Set(["timeout", "no_answer", "user_busy", "call_rejected", "normal_clearing"]);
/** SIP-koder for numre der ikke findes / ikke er i brug. */
const INVALID_NUMBER_SIP_CODES = new Set(["404", "410", "484", "604"]);

export function classifyPowerLeadHangup(input: {
  hangupCause: string | null | undefined;
  sipHangupCause?: string | null;
  answered: boolean;
  bridged: boolean;
}): PowerResolution {
  if (input.bridged) return "CONNECTED";
  // Leadet tog telefonen, men blev ikke forbundet (lagde på under AMD eller mens sælgeren blev ringet op).
  if (input.answered) return "DROP_LEAD_HUNGUP";
  const cause = String(input.hangupCause ?? "").trim().toLowerCase();
  const sip = String(input.sipHangupCause ?? "").trim();
  if (cause === "not_found" || INVALID_NUMBER_SIP_CODES.has(sip)) return "INVALID_NUMBER";
  if (NO_ANSWER_CAUSES.has(cause)) return "NO_ANSWER";
  return "TECHNICAL";
}

export type PowerLeadEffect = {
  /** Sæt leadets status (kun hvis leadet stadig er «Ny»; VOICEMAIL også fra NOT_HOME). */
  status: "NOT_HOME" | "VOICEMAIL" | null;
  /** Tæl som ubesvaret kontaktforsøg (maxContactAttempts). */
  countAttempt: boolean;
  /** Sæt powerDialerEligibleAfter = nu + ms (leadet forbliver/bliver Ny). */
  eligibleAfterMs: number | null;
  /** Kort aktivitetstekst på leadet (null = ingen). */
  activitySummary: string | null;
};

export function powerLeadEffectFor(
  resolution: PowerResolution,
  ctx: {
    amdMachineCountsAttempt: boolean;
    unansweredCooldownHours: number;
    requeueCooldownMs: number;
  },
): PowerLeadEffect {
  const none: PowerLeadEffect = {
    status: null,
    countAttempt: false,
    eligibleAfterMs: null,
    activitySummary: null,
  };
  const campaignCooldownMs = Math.max(1, ctx.unansweredCooldownHours) * 60 * 60 * 1000;
  switch (resolution) {
    case "CONNECTED":
      return none;
    case "NO_ANSWER":
      return { ...none, status: "NOT_HOME", countAttempt: true };
    case "INVALID_NUMBER":
      return {
        status: "NOT_HOME",
        countAttempt: true,
        eligibleAfterMs: POWER_INVALID_NUMBER_COOLDOWN_MS,
        activitySummary: "Power Dialer: nummeret findes ikke — springes over i 7 dage",
      };
    case "VOICEMAIL":
      return { ...none, status: "VOICEMAIL", countAttempt: ctx.amdMachineCountsAttempt };
    case "AMD_UNCERTAIN_REQUEUE":
    case "CANCELLED_OVERDIAL":
    case "TECHNICAL":
      return { ...none, eligibleAfterMs: ctx.requeueCooldownMs };
    case "DROP_NO_AGENT":
    case "DROP_LEAD_HUNGUP":
      return { ...none, eligibleAfterMs: campaignCooldownMs };
    default:
      return none;
  }
}

export const POWER_RESOLUTION_LABELS: Record<PowerResolution, string> = {
  CONNECTED: "Forbundet til sælger",
  NO_ANSWER: "Intet svar / optaget",
  INVALID_NUMBER: "Ugyldigt nummer",
  VOICEMAIL: "Telefonsvarer",
  AMD_UNCERTAIN_REQUEUE: "Usikkert AMD — prøves igen",
  DROP_NO_AGENT: "Drop — ingen ledig sælger",
  DROP_LEAD_HUNGUP: "Lead lagde på før forbindelse",
  CANCELLED_OVERDIAL: "Lagt på (ingen ledig kapacitet)",
  TECHNICAL: "Teknisk fejl",
};
