import { NextResponse } from "next/server";
import { VOICES } from "@/lib/ai-saelger/agents";
import { AGENT_MODEL, AGENT_MODELS } from "@/lib/ai-saelger/practice/simulate";
import { readPlaybook } from "@/lib/ai-saelger/playbooks";
import { aiSaelgerSystemPrompt } from "@/lib/ai-saelger/system-prompt";
import { adrianTrainingSection } from "@/lib/ai-saelger/training-db";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { getViewer } from "@/lib/scripts-traening/queries";

export const maxDuration = 30;

/** POST /api/ai-saelger/traening/adrian { customerLine } — hvad Adrian (med al træning indtil nu) ville sige. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { customerLine?: string } | null;
  const line = b?.customerLine?.trim().slice(0, 600);
  if (!line) return NextResponse.json({ error: "Mangler kundens replik" }, { status: 400 });
  const variant = { key: "lavt_pres/christian-v3c", approach: "lavt_pres" as const, voice: VOICES.find((v) => v.key === "christian-v3c")! };
  const playbook = readPlaybook("lavt_pres");
  try {
    const res = await createAnthropicClient().messages.create({
      ...AGENT_MODELS[AGENT_MODEL].params,
      model: AGENT_MODEL,
      system: aiSaelgerSystemPrompt(variant, playbook, await adrianTrainingSection()),
      messages: [{ role: "user", content: `(Øvelse, midt i en samtale med en klinikejer.) Kunden siger: «${line}»\nSvar kun med det, du siger højt.` }],
    });
    return NextResponse.json({ reply: res.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join(" ").trim() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Adrian kunne ikke svare" }, { status: 502 });
  }
}
