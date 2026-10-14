import { NextResponse } from "next/server";
import { VOICES } from "@/lib/ai-saelger/agents";
import { readPlaybook } from "@/lib/ai-saelger/playbooks";
import { AGENT_MODELS, type AgentModel } from "@/lib/ai-saelger/practice/simulate";
import { evalCase, type EvalResult } from "@/lib/ai-saelger/principles";
import { aiSaelgerSystemPrompt } from "@/lib/ai-saelger/system-prompt";
import { adrianTrainingSection } from "@/lib/ai-saelger/training-db";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/scripts-traening/queries";

export const maxDuration = 300;

/**
 * POST { model?, limit? } — regressionstest: de nyeste 👎-lektioner (højst 20) spilles igen gennem Adrian
 * med al træning indtil nu, og en dommer vurderer, om han nu svarer som Ernestos bedre svar.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { model?: string; limit?: number } | null;
  const model = (b?.model && b.model in AGENT_MODELS ? b.model : "claude-sonnet-5-5") as AgentModel;
  const cases = await prisma.aiSaelgerLesson.findMany({
    where: { rating: -1 },
    orderBy: { createdAt: "desc" },
    take: Math.min(20, Math.max(1, b?.limit ?? 20)),
    select: { id: true, customerLine: true, context: true, avoidAnswer: true, answer: true, reason: true },
  });
  if (!cases.length) return NextResponse.json({ error: "Ingen 👎-feedback at teste endnu" }, { status: 400 });
  const voice = VOICES.find((v) => v.key === "christian-v3c")!;
  const system = aiSaelgerSystemPrompt({ key: "lavt_pres/christian-v3c", approach: "lavt_pres", voice }, readPlaybook("lavt_pres"), await adrianTrainingSection());
  const client = createAnthropicClient();
  const results: EvalResult[] = [];
  let costUsd = 0;
  for (const c of cases) {
    try {
      const r = await evalCase({ client, system, model, c });
      results.push(r.result);
      costUsd += r.costUsd;
    } catch (e) {
      results.push({ id: c.id, customerLine: c.customerLine, newAnswer: "", pass: false, why: `Fejl: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return NextResponse.json({ model, passed: results.filter((r) => r.pass).length, total: results.length, costUsd, results });
}
