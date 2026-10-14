/**
 * Turtagning (Ernesto, 14/10): lyd som et menneske, ikke som en AI.
 * - Kunden afbryder: agenten siger sin halve sætning færdig (højst ca. 1,5 sek.) og svarer så, hvis det
 *   giver mening. Et «mm/ja» er bare lytning, og agenten taler videre.
 * - Agenten bryder ind, når kunden taler for meget eller har en forkert antagelse om Allio. Sjældent.
 * - Tavshed: vent 3–5 sek. (til det lige bliver lidt akavet), men lad aldrig samtalen gå i stå.
 * Rene funktioner; stemmeserveren kalder dem på hver hændelse.
 */
import { BARGE_IN_LABELS, type RouterLabel } from "./router";

const BACKCHANNEL = /^(m+|mhm+|mm+|ja+|jo+|nå+|okay|ok|ja ja|jaja|nej nej|klart|præcis|rigtigt|nemlig|uh+|øh+|hmm+|aha)[.!?]?$/i;

export function isBackchannel(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[,.!?]/g, "").replace(/\s+/g, " ");
  return t.length > 0 && t.split(" ").length <= 2 && BACKCHANNEL.test(t);
}

/** Hvor længe agenten højst taler videre ind over kunden, før den holder inde. */
export const MAX_OVERLAP_MS = 1500;

export type InterruptDecision =
  | { action: "keep_talking" }
  /** Sig færdig til næste naturlige pause (komma/punktum), dog højst `maxMs`, og stop så. */
  | { action: "finish_phrase_then_yield"; maxMs: number };

/** Kunden taler, mens agenten taler. */
export function onCustomerSpeechWhileAgentSpeaks(customerText: string): InterruptDecision {
  if (isBackchannel(customerText)) return { action: "keep_talking" };
  return { action: "finish_phrase_then_yield", maxMs: MAX_OVERLAP_MS };
}

/** Ord, kunden har sagt i træk, før agenten må bryde ind for at styre samtalen tilbage. */
export const MONOLOGUE_WORDS = 70;
/** Højst så mange brud pr. samtale, ellers virker agenten uhøflig. */
export const MAX_BARGE_INS = 2;

/** Kunden taler, agenten er tavs: skal agenten bryde ind? */
export function shouldBargeIn(params: { label: RouterLabel; customerWordsThisTurn: number; bargeInsSoFar: number }): boolean {
  if (params.bargeInsSoFar >= MAX_BARGE_INS) return false;
  if (params.label === "forkert_antagelse") return params.customerWordsThisTurn >= 6;
  return BARGE_IN_LABELS.has(params.label) || params.customerWordsThisTurn >= MONOLOGUE_WORDS;
}

/** Tavshed efter agentens spørgsmål: 3–5 sek., lidt tilfældigt, så det ikke lyder mekanisk. */
export function silenceTimeoutMs(random: () => number = Math.random): number {
  return 3000 + Math.round(random() * 2000);
}

/** Hvad agenten gør, når tavsheden er udløbet: først en blid opfordring, så videre i samtalen. */
export function onSilence(timesInARow: number): "nudge" | "move_on" {
  return timesInARow <= 1 ? "nudge" : "move_on";
}
