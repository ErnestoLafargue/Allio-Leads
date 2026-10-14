/**
 * Databasedelen af «Træn Adrian»: lektioner (AiSaelgerLesson), rigtige kundecitater pr. kategori og
 * sektionen til Adrians systemprompt.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { objectionBank } from "@/lib/live-coach/script-responses";
import { prisma } from "@/lib/prisma";
import { loadQuoteBank, pickQuote } from "@/lib/scripts-traening/quote-bank";
import { FIXED_SITUATIONS, lessonsPromptSection, type Lesson, type Situation } from "./training";

export async function loadLessons(take = 300): Promise<(Lesson & { id: string; createdAt: Date })[]> {
  return prisma.aiSaelgerLesson.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, situation: true, customerLine: true, answer: true, avoidAnswer: true, rating: true, reason: true, context: true, routerLabel: true, createdAt: true },
  });
}

/** Den godkendte version af Adrians principper (tom streng, hvis ingen er godkendt). */
export async function activePrinciples(): Promise<{ version: number; text: string } | null> {
  return prisma.aiSaelgerPrinciples.findFirst({ where: { status: "active" }, orderBy: { version: "desc" }, select: { version: true, text: true } });
}

/** Adrians træning: principper + Ernestos lektioner + svarbanken (systemprompt) og lektionerne til relevans pr. tur. */
export async function adrianTraining(): Promise<{ section: string; lessons: Lesson[] }> {
  const [lessons, bank, principles] = await Promise.all([loadLessons(), objectionBank(), activePrinciples()]);
  return { section: lessonsPromptSection(lessons, bank, 4, principles?.text ?? ""), lessons };
}

/** Kun systemprompt-sektionen. */
export async function adrianTrainingSection(): Promise<string> {
  return (await adrianTraining()).section;
}

type Objection = { category: ObjectionCategory; customer?: { quote?: string } };

/**
 * En kundereplik til kortet: for indvendingskategorier et rigtigt citat fra den rensede citatbank (med
 * sælgerens replik før), ellers en fast replik.
 */
export async function customerLineFor(situation: Situation): Promise<{ customerLine: string; agentBefore: string | null }> {
  const fixed = (FIXED_SITUATIONS as Record<string, { lines: readonly string[] }>)[situation];
  if (fixed) return { customerLine: fixed.lines[Math.floor(Math.random() * fixed.lines.length)]!, agentBefore: null };
  const banked = pickQuote(await loadQuoteBank(), situation);
  if (banked) return { customerLine: banked.customerLine, agentBefore: banked.agentBefore };
  const rows = await prisma.callAnalysis.findMany({ select: { result: true } });
  const quotes: string[] = [];
  for (const r of rows) {
    for (const o of ((r.result as { objections?: Objection[] }).objections ?? [])) {
      const q = o.customer?.quote?.trim();
      const words = q?.split(/\s+/).length ?? 0;
      if (o.category === situation && q && words >= 4 && words <= 30) quotes.push(q);
    }
  }
  return { customerLine: quotes.length ? quotes[Math.floor(Math.random() * quotes.length)]! : "(ingen citater i denne kategori endnu)", agentBefore: null };
}
