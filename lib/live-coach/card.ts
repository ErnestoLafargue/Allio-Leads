/**
 * Live-coachens kortformat — delt mellem server (Claude) og browser (ingen server-afhængigheder).
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { OBJECTION_TRIGGERS, type CoachSignal } from "./triggers";

export type CoachLine = { speaker: "agent" | "customer"; text: string };

const SIGNALS: ReadonlySet<string> = new Set(["tryghed", "klarhed", "okonomi", "skepsis", "timing", "lav_interesse"]);
const CATEGORIES: ReadonlySet<string> = new Set([...OBJECTION_TRIGGERS.map((t) => t.category), "other"]);

export type ParsedCoachText = {
  signal: CoachSignal | null;
  /** Den indvending, kortet svarer på (null = ingen/ukendt). */
  objection: ObjectionCategory | null;
  /** Kort vurdering af kunden lige nu (3–8 ord). */
  customer: string;
  why: string;
  line: string;
  silent: boolean;
  /** AI: samtalen har udviklet sig, så kortet på skærmen ikke længere passer. */
  fresh: boolean;
};

/** Læser et (evt. ufærdigt) svar i formatet SIGNAL/INDVENDING/KUNDE/NYT/HVORFOR/REPLIK. */
export function parseCoachText(text: string): ParsedCoachText {
  const field = (name: string) => text.match(new RegExp(`${name}:\\s*([^\\n]*)`))?.[1]?.trim() ?? "";
  const rawSignal = field("SIGNAL").toLowerCase().replace(/ø/g, "o").replace(/[*_\s]+/g, "_").replace(/^_|_$/g, "");
  const rawObjection = field("INDVENDING").toLowerCase().replace(/[*\s]+/g, "");
  return {
    signal: SIGNALS.has(rawSignal) ? (rawSignal as CoachSignal) : null,
    objection: CATEGORIES.has(rawObjection) ? (rawObjection as ObjectionCategory) : null,
    customer: field("KUNDE"),
    why: field("HVORFOR"),
    line: field("REPLIK"),
    silent: rawSignal === "ingen",
    fresh: /^ja\b/i.test(field("NYT")),
  };
}
