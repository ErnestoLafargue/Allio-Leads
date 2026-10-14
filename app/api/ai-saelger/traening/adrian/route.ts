import { NextResponse } from "next/server";
import { VOICES } from "@/lib/ai-saelger/agents";
import { AGENT_MODELS } from "@/lib/ai-saelger/practice/simulate";
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
  const b = (await req.json().catch(() => null)) as {
    customerLine?: string;
    agentBefore?: string | null;
    lead?: Partial<Record<"kliniknavn" | "by" | "beslutningstager" | "bookingsystem" | "branche", string>>;
  } | null;
  const l = b?.lead ?? {};
  const who = l.beslutningstager || l.kliniknavn ? ` Du taler med ${l.beslutningstager ?? "ejeren"} fra ${l.kliniknavn ?? "klinikken"}${l.branche ? ` (${l.branche}` : ""}${l.by ? `${l.branche ? ", " : " ("}${l.by}` : ""}${l.branche || l.by ? ")" : ""}${l.bookingsystem ? `, som bruger ${l.bookingsystem}` : ""}.` : "";
  const before = b?.agentBefore?.trim().slice(0, 300);
  const line = b?.customerLine?.trim().slice(0, 600);
  if (!line) return NextResponse.json({ error: "Mangler kundens replik" }, { status: 400 });
  const variant = { key: "lavt_pres/christian-v3c", approach: "lavt_pres" as const, voice: VOICES.find((v) => v.key === "christian-v3c")! };
  const playbook = readPlaybook("lavt_pres");
  try {
    const model = "claude-sonnet-5-5" as const;
    const res = await createAnthropicClient().messages.create({
      ...(AGENT_MODELS[model].params as object),
      max_tokens: AGENT_MODELS[model].params.max_tokens,
      model,
      system: aiSaelgerSystemPrompt(variant, playbook, await adrianTrainingSection()),
      messages: [{ role: "user", content: `(Øvelse, midt i en samtale med en klinikejer.)${who}${before ? ` Du har lige sagt: «${before}»` : ""} Kunden siger: «${line}»\nSvar kun med det, du siger højt.` }],
    });
    return NextResponse.json({ reply: res.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join(" ").trim() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Adrian kunne ikke svare" }, { status: 502 });
  }
}
