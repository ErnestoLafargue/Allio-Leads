/**
 * Live-coach, lag 1: genkender kundens indvending på de første ord (også mens kunden stadig taler)
 * og viser straks det bedste svar — uden AI-kald. Svarene kommer fra det aktive «ugens script»
 * (bygget på jeres egne samtaler) med de foretrukne svar som reserve.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";

export type CoachSignal = "tryghed" | "klarhed" | "okonomi" | "skepsis" | "timing" | "lav_interesse";

export type ObjectionTrigger = {
  category: ObjectionCategory;
  signal: CoachSignal;
  /** 3–6 ord: hvad kunden mangler */
  why: string;
  patterns: RegExp[];
};

/** Rækkefølgen betyder noget: den første indvending, der matcher, vinder. */
export const OBJECTION_TRIGGERS: ObjectionTrigger[] = [
  {
    category: "price",
    signal: "okonomi",
    why: "Kender ikke værdien endnu",
    patterns: [/hvad koster/, /\bpris(en)?\b/, /for dyrt|lyder dyrt|er det dyrt/, /har ikke råd|ikke budget/],
  },
  {
    category: "has_booking_system",
    signal: "klarhed",
    why: "Tror Allio kun er booking",
    patterns: [/(har|bruger) (allerede )?(et |en )?(booking|bookingsystem|system)/, /\b(planway|onlinebooq|geckobook|easypractice|ordinationen)\b/],
  },
  {
    category: "has_agency",
    signal: "klarhed",
    why: "Tror I erstatter bureauet",
    patterns: [/(har|bruger) (allerede )?(et |en )?(bureau|marketingbureau|reklamebureau)/, /nogen der (laver|styrer) (vores )?marketing/],
  },
  {
    category: "send_email",
    signal: "skepsis",
    why: "Vil skubbe beslutningen væk",
    patterns: [/send (mig )?(noget |lidt |en )?(på )?(mail|e-?mail)/, /på mail/, /skrive en mail/],
  },
  {
    category: "no_time",
    signal: "timing",
    why: "Ser ikke tid til det",
    patterns: [/har ikke tid|ingen tid|travlt/, /ikke lige nu|midt i en (behandling|kunde)/],
  },
  {
    category: "fully_booked",
    signal: "lav_interesse",
    why: "Tror de ikke mangler kunder",
    patterns: [/fuldt? booket|fyldt op|har (rigeligt|nok) (at lave|kunder)/],
  },
  {
    category: "talk_to_partner",
    signal: "tryghed",
    why: "Skal have makker med",
    patterns: [/snakke med (min|mine) (partner|kompagnon|mand|kone|chef)/, /ikke mig der bestemmer/],
  },
  {
    category: "think_about_it",
    signal: "tryghed",
    why: "Usikker, mangler konkret grund",
    patterns: [/tænke over det|overveje det|vende det/],
  },
  {
    category: "not_interested",
    signal: "lav_interesse",
    why: "Ser ikke relevansen endnu",
    patterns: [/ikke interesseret|interesserer (mig|os) ikke|nej tak/],
  },
];

/** Foretrukne svar (allio-business), bruges når ugens script ikke har et svar på indvendingen. */
export const DEFAULT_RESPONSES: Partial<Record<ObjectionCategory, string>> = {
  has_booking_system:
    "Det er jo godt — Allio er ikke et nyt bookingsystem. Vi hjælper med det, der sker før og efter bookingen: flere genbesøg og genaktivering af de kunder, I allerede har.",
  has_agency:
    "Fint — vi erstatter ikke bureauet. De skaffer kunderne, vi sørger for, at I får mere ud af dem bagefter.",
  no_time:
    "Det forstår jeg godt. Derfor kommer vi ud til jer og kigger på jeres egne tal — det tager en time, og så ved du, om der er noget at komme efter.",
  price:
    "Det kommer an på, hvad der giver mening for jer. Lad os først se potentialet i jeres egne tal — så kan du holde prisen op mod noget konkret.",
  send_email:
    "Det kan jeg godt, men en mail viser kun Allio generelt. Det interessante er, hvad det betyder for jer med jeres egne tal — skal vi ikke tage en time på det?",
};

export type CoachCard = {
  source: "trigger" | "ai";
  category: ObjectionCategory | null;
  signal: CoachSignal;
  why: string;
  line: string;
};

export function normalizeSpeech(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:"«»()]/g, " ").replace(/\s+/g, " ").trim();
}

/** Finder den første indvending i kundens seneste ord (tekst kan være ufærdig). */
export function detectObjection(customerText: string): ObjectionTrigger | null {
  const text = normalizeSpeech(customerText);
  if (!text) return null;
  return OBJECTION_TRIGGERS.find((t) => t.patterns.some((p) => p.test(text))) ?? null;
}

/** Straks-kortet til en indvending: ugens script først, ellers det foretrukne svar. */
export function triggerCard(
  trigger: ObjectionTrigger,
  scriptResponses: Partial<Record<ObjectionCategory, string>>,
): CoachCard | null {
  const line = scriptResponses[trigger.category] ?? DEFAULT_RESPONSES[trigger.category];
  if (!line) return null;
  return { source: "trigger", category: trigger.category, signal: trigger.signal, why: trigger.why, line };
}
