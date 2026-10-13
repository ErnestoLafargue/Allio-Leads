/**
 * Svarene på indvendinger fra det aktive «ugens script» — grundlaget for live-coachens kort.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { prisma } from "@/lib/prisma";
import type { WeeklyScript } from "@/lib/sales-scripts/schema";
import { withPreferred } from "./preferred-answers";

export async function activeScriptResponses(): Promise<Partial<Record<ObjectionCategory, string>>> {
  const active = await prisma.salesScriptVersion.findFirst({
    where: { kind: "WEEKLY", isActive: true },
    select: { content: true },
  });
  const script = active?.content as unknown as WeeklyScript | undefined;
  const out: Partial<Record<ObjectionCategory, string>> = {};
  for (const o of script?.objections ?? []) if (o.response && !out[o.category]) out[o.category] = o.response;
  // Ernestos egne foretrukne svar vægter højest.
  return withPreferred(out);
}

/** Linjerne i det aktive ugens script i rækkefølge — til script-trackeren (SCRIPT/AFVIGELSE/TILBAGE). */
export async function activeScriptLines(): Promise<{ phase: string; text: string }[]> {
  const active = await prisma.salesScriptVersion.findFirst({
    where: { kind: "WEEKLY", isActive: true },
    select: { content: true },
  });
  const script = active?.content as unknown as WeeklyScript | undefined;
  return (script?.sections ?? []).flatMap((s) => s.lines.map((l) => ({ phase: s.key, text: l.text })));
}

export type ObjectionBank = Partial<Record<ObjectionCategory, string[]>>;

let bankCache: { at: number; bank: ObjectionBank } | null = null;
const BANK_TTL_MS = 60 * 60 * 1000;

/**
 * Svarbanken: de stærkeste rigtige svar, sælgerne har givet på hver indvending (ordrette citater fra
 * de analyserede samtaler; samtaler, der endte med møde, først). Caches i en time.
 */
export async function objectionBank(perCategory = 3): Promise<ObjectionBank> {
  if (bankCache && Date.now() - bankCache.at < BANK_TTL_MS) return bankCache.bank;
  const rows = await prisma.callAnalysis.findMany({
    select: { result: true, callRecording: { select: { outcomeStatus: true } } },
  });
  const candidates: { category: ObjectionCategory; text: string; rank: number }[] = [];
  for (const r of rows) {
    const objections = (r.result as { objections?: { category: ObjectionCategory; handling: string; followsPreferredAnswer?: boolean; response: { quote: string } | null }[] }).objections ?? [];
    for (const o of objections) {
      if (o.handling !== "strong" || !o.response?.quote) continue;
      const words = o.response.quote.split(/\s+/).length;
      if (words < 6 || words > 40) continue;
      const rank = (r.callRecording.outcomeStatus === "MEETING_BOOKED" ? 2 : 0) + (o.followsPreferredAnswer ? 1 : 0);
      candidates.push({ category: o.category, text: o.response.quote, rank });
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);
  const bank: ObjectionBank = {};
  for (const c of candidates) {
    const list = (bank[c.category] ??= []);
    if (list.length < perCategory && !list.includes(c.text)) list.push(c.text);
  }
  bankCache = { at: Date.now(), bank };
  return bank;
}
