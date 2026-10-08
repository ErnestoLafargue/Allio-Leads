import {
  chosenDialNumber,
  primaryDialPhone,
  type DialNumberMenuItem,
  type DialPhonePriority,
} from "@/lib/lead-phones";
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
  | { type: "stay" }
  | { type: "failover" }
  | { type: "advance"; outcome: Exclude<PredictiveAutoOutcome, null> };

/**
 * Kunden lagde på, eller systemet klassificerede opkaldet.
 * Opdaget telefonsvarer og ubesvaret ringer næste nummer på samme kunde, også når
 * svareren nåede at forbinde (`hadLive`). Uden flere numre går det udfald videre.
 * En rigtig samtale, eller en telefonsvarer systemet ikke opdagede (`hadLive` uden udfald),
 * bliver på billedet, så sælgeren selv kan vælge nummer og udfald.
 * Agentens egen læg-på er ikke denne funktion.
 */
export function predictiveActionAfterRemoteEnd(input: {
  hadLive: boolean;
  autoOutcome: PredictiveAutoOutcome;
  canFailover: boolean;
}): PredictiveRemoteEndAction {
  const detectedMiss =
    input.autoOutcome === "VOICEMAIL" || (!input.hadLive && input.autoOutcome != null);
  if (detectedMiss && input.canFailover) {
    return { type: "failover" };
  }
  if (input.hadLive && input.autoOutcome !== "VOICEMAIL") {
    return { type: "stay" };
  }
  if (input.autoOutcome) {
    return { type: "advance", outcome: input.autoOutcome };
  }
  return { type: "stay" };
}

/**
 * Sælgeren vælger et nummer i rullemenuen.
 * Menuen findes, når leadet har to numre, også mens det andet nummer ringes automatisk.
 */
export function applyDialMenuChoice(
  menu: readonly DialNumberMenuItem[],
  primaryRaw: string,
  selectedRaw: string,
): { phone: string; usingAlternate: boolean } | null {
  const chosen = chosenDialNumber(menu, selectedRaw);
  if (!chosen) return null;
  return {
    phone: chosen.raw,
    usingAlternate: !sameDialTarget(chosen.raw, primaryRaw),
  };
}

export type DialMenuAction =
  | { type: "keep" }
  | { type: "dial"; phone: string; usingAlternate: boolean; hangUpFirst: boolean };

/**
 * Et andet nummer i menuen ringes op med det samme.
 * Er linjen i gang, lægges der på først, så det viste nummer og opkaldet er det samme.
 * Samme nummer som det aktuelle starter ikke et nyt opkald.
 */
export function dialActionForMenuChoice(input: {
  menu: readonly DialNumberMenuItem[];
  primaryRaw: string;
  currentRaw: string;
  selectedRaw: string;
  lineBusy: boolean;
}): DialMenuAction {
  const choice = applyDialMenuChoice(input.menu, input.primaryRaw, input.selectedRaw);
  if (!choice) return { type: "keep" };
  if (sameDialTarget(choice.phone, input.currentRaw)) return { type: "keep" };
  return {
    type: "dial",
    phone: choice.phone,
    usingAlternate: choice.usingAlternate,
    hangUpFirst: input.lineBusy,
  };
}
