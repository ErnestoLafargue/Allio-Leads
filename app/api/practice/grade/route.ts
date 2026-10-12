import { NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/call-analysis/schema";
import { gradePracticeAnswer, practiceSystemPrompt } from "@/lib/live-coach/practice";
import { activeScriptResponses, objectionBank } from "@/lib/live-coach/script-responses";
import { getViewer } from "@/lib/scripts-traening/queries";

/** POST /api/practice/grade { category, customerLine, answer } — feedback på sælgerens svar. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { category?: string; customerLine?: string; answer?: string } | null;
  if (!b?.answer?.trim() || !b.customerLine || !(OBJECTION_CATEGORIES as readonly string[]).includes(b.category ?? "")) {
    return NextResponse.json({ error: "Mangler svar eller indvending" }, { status: 400 });
  }
  try {
    const { feedback, costUsd } = await gradePracticeAnswer({
      client: createAnthropicClient(),
      system: practiceSystemPrompt(await activeScriptResponses(), await objectionBank()),
      category: b.category as ObjectionCategory,
      customerLine: b.customerLine.slice(0, 400),
      answer: b.answer,
    });
    console.log(`[øv] ${viewer.name}: ${b.category} → ${feedback.score} ($${costUsd.toFixed(4)})`);
    return NextResponse.json(feedback);
  } catch (err) {
    console.warn("[øv]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kunne ikke vurdere svaret" }, { status: 502 });
  }
}
