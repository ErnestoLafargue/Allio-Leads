/**
 * Lag 3 i Adrians læring: Sonnet læser al Ernestos feedback (lektioner med begrundelser) og den
 * nuværende version af principperne og foreslår en ny, kort version. Ernesto godkender eller afviser i
 * «Træn Adrian»; kun den godkendte version kommer i Adrians systemprompt. Ældre versioner kan genaktiveres.
 *
 * Lag 4: regressionstest. Hver 👎-lektion bliver en testsag: kundens replik (med sammenhængen) spilles
 * igen gennem Adrian med den nuværende træning, og en dommer vurderer, om svaret nu følger Ernestos
 * bedre svar og begrundelse frem for det afviste.
 */
import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { structuredCall, usageCostUsd } from "@/lib/anthropic-client";
import { AGENT_MODELS, type AgentModel } from "./practice/simulate";
import { formatLesson, type Lesson } from "./training";

export const PRINCIPLES_MODEL = "claude-sonnet-5-5";
export const EVAL_JUDGE_MODEL = "claude-haiku-5-5";

const PrinciplesSchema = z.object({
  principles: z
    .array(z.string())
    .describe("Højst 15 korte, konkrete regler i bydeform på dansk, hver med et kort eksempel på formulering, hvor det hjælper"),
  rationale: z.string().describe("2–4 sætninger: hvad er nyt eller ændret i forhold til den nuværende version, og hvilken feedback det bygger på"),
});

export async function proposePrinciples(params: {
  client: Anthropic;
  lessons: readonly Lesson[];
  current: string | null;
}): Promise<{ text: string; rationale: string; costUsd: number }> {
  const feedback = params.lessons.map(formatLesson).join("\n");
  const { output, costUsd } = await structuredCall({
    client: params.client,
    model: PRINCIPLES_MODEL,
    effort: "medium",
    maxTokens: 8000,
    schema: PrinciplesSchema,
    system: `Du er salgschef hos Allio og træner AI-mødebookeren Adrian, der ringer til klinikker for at booke et møde. Ernesto (ejeren) har givet feedback på Adrians svar: 👍 med hvorfor, eller 👎 med hvorfor og et bedre svar. Destillér feedbacken til Adrians principper: få, generelle og konkrete regler, der får ham til at svare som Ernesto. Bevar regler fra den nuværende version, som stadig holder; slå sammen, hvor det overlapper; slet ikke noget, Ernesto har bekræftet. Opfind ikke regler, feedbacken ikke bærer. Skriv til Adrian i du-form.`,
    userMessage: `Nuværende principper:\n${params.current?.trim() || "(ingen endnu)"}\n\nErnestos feedback (nyeste først):\n${feedback || "(ingen)"}`,
  });
  return { text: output.principles.map((p) => `- ${p.replace(/^[-•]\s*/, "")}`).join("\n"), rationale: output.rationale, costUsd };
}

const VerdictSchema = z.object({
  pass: z.boolean().describe("true hvis det nye svar følger Ernestos bedre svar og begrundelse (i ånden, ikke ordret) og ikke gentager fejlen i det afviste svar"),
  why: z.string().describe("Én kort sætning"),
});

export type EvalCase = { id: string; customerLine: string; context: string | null; avoidAnswer: string | null; answer: string; reason: string | null };
export type EvalResult = { id: string; customerLine: string; newAnswer: string; pass: boolean; why: string };

/** Spiller én 👎-lektion igen gennem Adrian (uden værktøjer) og lader en dommer vurdere svaret. */
export async function evalCase(params: { client: Anthropic; system: string; model: AgentModel; c: EvalCase }): Promise<{ result: EvalResult; costUsd: number }> {
  const { client, c } = params;
  const res = await client.messages.create({
    ...(AGENT_MODELS[params.model].params as Partial<Anthropic.MessageCreateParamsNonStreaming>),
    max_tokens: AGENT_MODELS[params.model].params.max_tokens,
    model: params.model,
    system: params.system,
    messages: [
      {
        role: "user",
        content: `(Øvelse midt i en samtale.)${c.context ? `\nSamtalen indtil nu:\n${c.context}` : ""}\nKunden siger: «${c.customerLine}»\nSvar kun med det, du siger højt.`,
      },
    ],
  });
  let costUsd = usageCostUsd(res.usage, params.model);
  const newAnswer = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
  const v = await structuredCall({
    client,
    model: EVAL_JUDGE_MODEL,
    effort: "low",
    maxTokens: 2000,
    schema: VerdictSchema,
    system: "Du vurderer, om en AI-mødebooker har lært af sin træners feedback. Vær streng, men bedøm ånden, ikke ordlyden.",
    userMessage: `Kunden: «${c.customerLine}»\nAfvist svar: «${c.avoidAnswer ?? "-"}»\nTrænerens bedre svar: «${c.answer}»\nTrænerens begrundelse: ${c.reason ?? "-"}\n\nNyt svar: «${newAnswer}»`,
  });
  costUsd += v.costUsd;
  return { result: { id: c.id, customerLine: c.customerLine, newAnswer, pass: v.output.pass, why: v.output.why }, costUsd };
}
