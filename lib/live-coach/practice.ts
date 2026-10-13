/**
 * Øve-tilstand: sælgeren træner indvendinger. Kunden siger en rigtig indvending (ordret fra jeres
 * analyserede samtaler, oftest i sælgerens svage kategorier), sælgeren svarer, og Claude Haiku giver
 * feedback ud fra ugens script, svarbanken, Pitch 8 og pris-reglen.
 */
import * as z from "zod/v4";
import type Anthropic from "@anthropic-ai/sdk";
import { ALLIO_HARD_RULES, ALLIO_PRODUCT } from "@/lib/allio-product";
import { structuredCall } from "@/lib/anthropic-client";
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { prisma } from "@/lib/prisma";
import type { ObjectionBank } from "./script-responses";

export const PRACTICE_MODEL = "claude-haiku-5-5";

type Objection = { category: ObjectionCategory; handling: string; customer: { quote: string } };
type Result = { objections?: Objection[] };

/** Sælgerens svage kategorier vægter tungere (svag/ingen håndtering i egne samtaler). */
export function weightCategories(own: readonly Objection[]): Map<ObjectionCategory, number> {
  const weights = new Map<ObjectionCategory, number>();
  for (const o of own) {
    if (o.category === "other") continue;
    const add = o.handling === "weak" || o.handling === "none" ? 3 : o.handling === "ok" ? 1 : 0.5;
    weights.set(o.category, (weights.get(o.category) ?? 1) + add);
  }
  return weights;
}

export function pickWeighted<T>(items: readonly [T, number][], random = Math.random): T | null {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = random() * total;
  for (const [item, w] of items) if ((r -= w) <= 0) return item;
  return items[items.length - 1]![0];
}

export async function nextPracticeObjection(userId: string): Promise<{ category: ObjectionCategory; customerLine: string } | null> {
  const rows = await prisma.callAnalysis.findMany({ select: { result: true, callRecording: { select: { agentUserId: true } } } });
  const all: Objection[] = [];
  const own: Objection[] = [];
  for (const r of rows) {
    for (const o of (r.result as Result).objections ?? []) {
      const words = o.customer?.quote?.split(/\s+/).length ?? 0;
      if (o.category === "other" || words < 4 || words > 30) continue;
      all.push(o);
      if (r.callRecording.agentUserId === userId) own.push(o);
    }
  }
  const weights = weightCategories(own);
  const categories = [...new Set(all.map((o) => o.category))].map((c) => [c, weights.get(c) ?? 1] as [ObjectionCategory, number]);
  const category = pickWeighted(categories);
  if (!category) return null;
  const quotes = all.filter((o) => o.category === category);
  return { category, customerLine: quotes[Math.floor(Math.random() * quotes.length)]!.customer.quote };
}

export const PracticeFeedbackSchema = z.object({
  score: z.number().int().describe("0–100: hvor godt svaret vender indvendingen og fører mod mødet"),
  good: z.array(z.string()).describe("1–2 korte punkter: hvad der var godt"),
  missing: z.array(z.string()).describe("1–2 korte punkter: hvad der manglede"),
  betterLine: z.string().describe("Et bedre svar: højst 2 korte sætninger i talesprog, der slutter med et valg mod mødet"),
});
export type PracticeFeedback = z.infer<typeof PracticeFeedbackSchema>;

export function practiceSystemPrompt(
  scriptResponses: Partial<Record<ObjectionCategory, string>>,
  bank: ObjectionBank,
  playbook = "",
): string {
  const answers = Object.entries(scriptResponses).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const real = Object.entries(bank).map(([k, list]) => `- ${k}: ${(list ?? []).map((t) => `«${t}»`).join(" / ")}`).join("\n");
  return `Du er salgstræner for Allios mødebookere. En sælger øver sig: kunden har sagt en indvending, og sælgeren har svaret. Giv kort, konkret og venlig feedback på dansk.

Målet med opkaldet er et ja til et møde, hvor en specialist viser klinikken, hvad der er at hente ud fra dens egne data.

${ALLIO_PRODUCT}

Et godt svar: anerkender kort → vender indvendingen mod værdien for kunden → slutter med et spørgsmål eller valg mod mødet. Kort og i talesprog.
Score: 80–100 = det ville sandsynligvis føre videre; 50–79 = godt, men mangler noget; under 50 = indvendingen blev ikke vendt.

Ugens script — bedste svar:
${answers || "- (ingen)"}

Indvendingsbogen — skabeloner (brug den, der passer, som facit for et godt svar):
${playbook || "- (ingen)"}

Rigtige stærke svar fra jeres bookede samtaler:
${real || "- (ingen)"}

${ALLIO_HARD_RULES}`;
}

export async function gradePracticeAnswer(params: {
  client: Anthropic;
  system: string;
  category: ObjectionCategory;
  customerLine: string;
  answer: string;
}): Promise<{ feedback: PracticeFeedback; costUsd: number }> {
  const { output, costUsd } = await structuredCall({
    client: params.client,
    model: PRACTICE_MODEL,
    system: params.system,
    userMessage: `Indvending (${params.category}): «${params.customerLine}»\nSælgerens svar: «${params.answer.slice(0, 800)}»\n\nGiv feedback nu.`,
    schema: PracticeFeedbackSchema,
    maxTokens: 2000,
  });
  return { feedback: { ...output, score: Math.max(0, Math.min(100, output.score)) }, costUsd };
}
