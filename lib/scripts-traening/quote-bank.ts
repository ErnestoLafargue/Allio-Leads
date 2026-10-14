/**
 * Den rensede citatbank: kundeindvendinger fra de analyserede samtaler, som er tydelige og kan forstås
 * alene (eller med sælgerens replik lige før). Bygges én gang af scripts/rens-indvendinger.ts og gemmes
 * i AppSetting, så «Øv indvendinger» og «Træn Adrian» ikke viser brudstykker og spørgsmål som indvendinger.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { prisma } from "@/lib/prisma";

export const QUOTE_BANK_SETTING_KEY = "objection-quote-bank-v1";

export type BankQuote = {
  category: Exclude<ObjectionCategory, "other">;
  customerLine: string;
  /** Sælgerens replik lige før (forkortet), så kortet giver mening. */
  agentBefore: string | null;
};

let cache: { at: number; quotes: BankQuote[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function loadQuoteBank(): Promise<BankQuote[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.quotes;
  const row = await prisma.appSetting.findUnique({ where: { key: QUOTE_BANK_SETTING_KEY } });
  const quotes = row ? (JSON.parse(row.value) as BankQuote[]) : [];
  cache = { at: Date.now(), quotes };
  return quotes;
}

export function pickQuote(quotes: readonly BankQuote[], category: string, random = Math.random): BankQuote | null {
  const list = quotes.filter((q) => q.category === category);
  return list.length ? list[Math.floor(random() * list.length)]! : null;
}
