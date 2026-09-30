/**
 * Live-coachens kortformat — delt mellem server (Claude) og browser (ingen server-afhængigheder).
 */
import type { CoachSignal } from "./triggers";

export type CoachLine = { speaker: "agent" | "customer"; text: string };

const SIGNALS: ReadonlySet<string> = new Set(["tryghed", "klarhed", "okonomi", "skepsis", "timing", "lav_interesse"]);

/** Læser et (evt. ufærdigt) svar i formatet SIGNAL/HVORFOR/REPLIK. */
export function parseCoachText(text: string): { signal: CoachSignal | null; why: string; line: string; silent: boolean } {
  const field = (name: string) => text.match(new RegExp(`${name}:\\s*([^\\n]*)`))?.[1]?.trim() ?? "";
  const rawSignal = field("SIGNAL").toLowerCase().replace("ø", "o");
  return {
    signal: SIGNALS.has(rawSignal) ? (rawSignal as CoachSignal) : null,
    why: field("HVORFOR"),
    line: field("REPLIK"),
    silent: rawSignal === "ingen",
  };
}

