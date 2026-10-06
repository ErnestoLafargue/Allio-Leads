import { primaryDialPhone, type DialPhonePriority } from "@/lib/lead-phones";
import { phoneDigitsForMatch } from "@/lib/phone-e164";
import type { PredictiveAutoOutcome } from "@/lib/voip-call-messages";

/**
 * Nummeret der både vises og ringes, når et lead åbnes.
 * Formularens forrige nummer må ikke bruges, hvis det ikke er dette leads nummer.
 */
export function dialPhoneForOpenLead(
  lead: { phone: string; privatePhone?: string | null },
  priority: DialPhonePriority,
): string {
  return primaryDialPhone(lead.phone, lead.privatePhone, priority);
}

export function sameDialTarget(a: string, b: string): boolean {
  const da = phoneDigitsForMatch(a);
  const db = phoneDigitsForMatch(b);
  if (!da || !db) return false;
  return da === db;
}

export type PredictiveAutoStartInput = {
  autoStart: boolean;
  audioReady: boolean;
  hasNumber: boolean;
  numberAllowed: boolean;
  /** Formularnummeret matcher det åbne leads nummer. Ellers er visningen forældet. */
  numberMatchesOpenLead: boolean;
  suppressedLeadId: string | null;
  leadId: string;
  lineBusy: boolean;
  previousKey: string | null;
  key: string;
};

/** Én auto-start pr. lead og nummerslot. Agentens læg-på sætter suppressedLeadId. */
export function shouldPredictiveAutoStart(input: PredictiveAutoStartInput): boolean {
  if (!input.autoStart) return false;
  if (!input.audioReady) return false;
  if (input.previousKey === input.key) return false;
  if (!input.hasNumber || !input.numberAllowed) return false;
  if (!input.numberMatchesOpenLead) return false;
  if (input.suppressedLeadId === input.leadId) return false;
  if (input.lineBusy) return false;
  return true;
}

export function predictiveAutoStartKey(
  leadId: string,
  slot: "primary" | "failover",
  autoStart: boolean,
): string {
  return `${leadId}|${slot}|${autoStart ? "1" : "0"}`;
}

export type PredictiveRemoteEndAction =
  | { type: "failover" }
  | { type: "advance"; outcome: PredictiveAutoOutcome };

/**
 * Kunden lagde på: gå videre til næste lead.
 * Andet nummer på SAMME lead prøves kun, når der ikke har været en samtale.
 * Agentens egen læg-på er ikke denne funktion — den bliver på leadet og ringer ikke igen.
 */
export function predictiveActionAfterRemoteEnd(input: {
  hadLive: boolean;
  autoOutcome: PredictiveAutoOutcome;
  canFailover: boolean;
}): PredictiveRemoteEndAction {
  if (!input.hadLive && input.autoOutcome && input.canFailover) {
    return { type: "failover" };
  }
  return { type: "advance", outcome: input.autoOutcome };
}
