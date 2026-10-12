/**
 * Live-coachen lærer af sælgernes 👍/👎: hver vurdering opdaterer, hvilke replikker coachen bruger.
 *  - Godkendt (netto 👍 ≥ 1): vises for AI'en som forbillede; med netto ≥ 2 bliver det straks-kortet.
 *  - Undgå (netto ≤ -1): AI'en får besked om ikke at bruge formuleringen; straks-kortet springer den over.
 * Netto = 👍 minus 👎 for præcis den replik i den kategori, så én enkelt 👎 ikke sletter et godt svar.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { prisma } from "@/lib/prisma";

export type Vote = { category: string | null; line: string | null; helpful: boolean | null };
export type RatedLine = { line: string; net: number; votes: number };
export type FeedbackBank = Partial<Record<ObjectionCategory, { liked: RatedLine[]; avoid: RatedLine[] }>>;

/** Nettoscore pr. kategori og replik (ren funktion). */
export function rankFeedback(votes: readonly Vote[], perCategory = 3): FeedbackBank {
  const score = new Map<string, { category: ObjectionCategory; line: string; net: number; votes: number }>();
  for (const v of votes) {
    if (!v.category || !v.line || v.helpful === null) continue;
    const key = `${v.category}\u0000${v.line.trim()}`;
    const s = score.get(key) ?? { category: v.category as ObjectionCategory, line: v.line.trim(), net: 0, votes: 0 };
    s.net += v.helpful ? 1 : -1;
    s.votes += 1;
    score.set(key, s);
  }
  const bank: FeedbackBank = {};
  for (const s of score.values()) {
    const entry = (bank[s.category] ??= { liked: [], avoid: [] });
    if (s.net >= 1) entry.liked.push({ line: s.line, net: s.net, votes: s.votes });
    else if (s.net <= -1) entry.avoid.push({ line: s.line, net: s.net, votes: s.votes });
  }
  for (const entry of Object.values(bank)) {
    if (!entry) continue;
    entry.liked = entry.liked.sort((a, b) => b.net - a.net || b.votes - a.votes).slice(0, perCategory);
    entry.avoid = entry.avoid.sort((a, b) => a.net - b.net || b.votes - a.votes).slice(0, perCategory);
  }
  return bank;
}

/** Straks-kortets svar: bedst bedømte replik (netto ≥ 2) før ugens script; scriptets svar droppes ved netto ≤ -1. */
export function effectiveResponses(
  scriptResponses: Partial<Record<ObjectionCategory, string>>,
  bank: FeedbackBank,
): Partial<Record<ObjectionCategory, string>> {
  const out: Partial<Record<ObjectionCategory, string>> = { ...scriptResponses };
  for (const [category, entry] of Object.entries(bank) as [ObjectionCategory, FeedbackBank[ObjectionCategory]][]) {
    if (!entry) continue;
    const best = entry.liked[0];
    if (best && best.net >= 2) out[category] = best.line;
    else if (out[category] && entry.avoid.some((a) => a.line === out[category]!.trim())) delete out[category];
  }
  return out;
}

let cache: { at: number; bank: FeedbackBank } | null = null;
const TTL_MS = 60 * 1000;

/** 👍/👎 fra de seneste 90 dage, opdateret hvert minut. */
export async function feedbackBank(): Promise<FeedbackBank> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.bank;
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const votes = await prisma.liveCoachEvent.findMany({
    where: { helpful: { not: null }, createdAt: { gte: since } },
    select: { category: true, line: true, helpful: true },
  });
  cache = { at: Date.now(), bank: rankFeedback(votes) };
  return cache.bank;
}
