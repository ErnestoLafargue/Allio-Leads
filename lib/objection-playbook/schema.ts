/**
 * Indvendingsbogen: de 30 hyppigste indvendinger fra jeres analyserede samtaler, hver med analyse,
 * bedste og dårligste behandling (med citater) og en skabelon, som live-coachen tilpasser kunden.
 * Gemmes som SalesScriptVersion med kind "PLAYBOOK" (content = PlaybookEntry[], evidence = stats).
 */
import * as z from "zod/v4";
import { OBJECTION_CATEGORIES } from "@/lib/call-analysis/schema";

export const PLAYBOOK_KIND = "PLAYBOOK";
export const PLAYBOOK_PROMPT_VERSION = "pb3";
export const PLAYBOOK_SIZE = 30;

export const MOVES = ["sporg", "forklar", "behandl", "luk"] as const;
export type PlaybookMove = (typeof MOVES)[number];

/** Trin 1: typerne (finere end de 11 kategorier). */
export const TaxonomySchema = z.object({
  types: z
    .array(
      z.object({
        key: z.string().describe("kort snake_case-nøgle, fx partner_okonomi"),
        title: z.string().describe("Indvendingen i kundens typiske ordlyd, fx «Jeg skal lige snakke med min mand»"),
        category: z.enum(OBJECTION_CATEGORIES),
        description: z.string().describe("1 sætning: hvad kunden reelt mener, og hvad der adskiller typen fra de andre"),
      }),
    )
    .describe(`Præcis ${PLAYBOOK_SIZE} typer, sorteret efter hvor ofte de forekommer`),
});
export type PlaybookType = z.infer<typeof TaxonomySchema>["types"][number];

/** Trin 2: hver indvending placeres i en type. */
export const ClassifySchema = z.object({
  items: z.array(z.object({ id: z.string(), type: z.string().describe("typens key, eller «none» hvis ingen passer") })),
});

/** Trin 3: analyse og skabelon pr. type. */
export const EntryAnalysisSchema = z.object({
  analysis: z.string().describe("2–4 sætninger: hvorfor kunderne siger det, og hvad der adskiller gode fra dårlige svar"),
  works: z.array(z.string()).describe("2–3 korte punkter: det, der virker (ud fra eksemplerne)"),
  fails: z.array(z.string()).describe("2–3 korte punkter: det, der ikke virker"),
  bestId: z.string().describe("id på det bedste eksempel"),
  bestWhy: z.string().describe("1 sætning: hvorfor det er bedst"),
  worstId: z.string().describe("id på det dårligste eksempel"),
  worstWhy: z.string().describe("1 sætning: hvorfor det er dårligst"),
  move: z.enum(MOVES).describe("Første træk: sporg (afdæk), forklar, behandl eller luk"),
  template: z.string().describe("Skabelonen: højst 3 korte sætninger i talesprog med [pladsholdere] for det, der skal tilpasses kunden"),
  principle: z.string().describe("1 sætning: princippet bag skabelonen"),
  adapt: z.array(z.string()).describe("2–3 korte punkter: hvordan skabelonen tilpasses den konkrete kunde"),
});
export type EntryAnalysis = z.infer<typeof EntryAnalysisSchema>;

export type PlaybookExample = {
  id: string;
  callRecordingId: string;
  /** Sekunder i optagelsen, hvor kunden siger indvendingen. */
  t: number;
  customer: string;
  response: string | null;
  /** Kundens reaktion lige efter svaret. */
  reaction: string | null;
  handling: string;
  booked: boolean;
};

export type PlaybookEntry = PlaybookType &
  Omit<EntryAnalysis, "bestId" | "worstId"> & {
    rank: number;
    count: number;
    /** Andel af alle indvendinger (0–1). */
    share: number;
    /** Bookingrate, når indvendingen blev godt behandlet (strong/ok) og dårligt (weak/none) — null ved for få. */
    bookedGood: number | null;
    bookedBad: number | null;
    nGood: number;
    nBad: number;
    best: PlaybookExample | null;
    worst: PlaybookExample | null;
  };

export type PlaybookStats = { objections: number; calls: number; classified: number; generatedAt: string };
