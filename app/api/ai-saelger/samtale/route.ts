import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { APPROACHES, VOICES, type ApproachKey } from "@/lib/ai-saelger/agents";
import { PERSONAS } from "@/lib/ai-saelger/practice/personas";
import { AGENT_MODELS, agentTurn, leadMessage, type AgentModel, type ToolState } from "@/lib/ai-saelger/practice/simulate";
import { withRouterHint } from "@/lib/ai-saelger/router";
import { createJevClient, routeWithJev, type JevRoute } from "@/lib/ai-saelger/router-jev";
import { aiSaelgerSystemPrompt } from "@/lib/ai-saelger/system-prompt";
import { adrianTrainingSection } from "@/lib/ai-saelger/training-db";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { getViewer } from "@/lib/scripts-traening/queries";

export const maxDuration = 60;

/** Genbruges mellem kald, så Jev ikke skal åbne en ny forbindelse hver gang (ca. 500 → 130 ms). */
let jev: ReturnType<typeof createJevClient> | null = null;

type Body = {
  approach?: string;
  personaKey?: string;
  model?: string;
  /** Kundens replik (første gang: det, kunden siger, når telefonen tages). */
  kunde?: string;
  /** Adrians seneste replik (til Jev). */
  sidsteAgentReplik?: string;
  /** Samtalen indtil nu (Claude-beskeder), sendes frem og tilbage af siden. */
  agentMsgs?: Anthropic.MessageParam[];
  state?: Omit<ToolState, "todayKey">;
};

/**
 * POST /api/ai-saelger/samtale — én tur, når man selv spiller kunden mod Adrian (kun admin, test).
 * Jev vælger først en label ud fra kundens replik og Adrians sidste replik; derefter svarer Adrian
 * med Jevs valg som hint. Værktøjerne er simulerede (falsk kalender, ingen rigtig booking eller mail).
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as Body | null;
  const kunde = b?.kunde?.trim().slice(0, 2000);
  const approach = (b?.approach ?? "lavt_pres") as ApproachKey;
  const persona = PERSONAS.find((p) => p.key === b?.personaKey) ?? PERSONAS[0]!;
  const model = (b?.model && b.model in AGENT_MODELS ? b.model : "claude-haiku-5-5") as AgentModel;
  if (!kunde || !APPROACHES[approach]?.file) return NextResponse.json({ error: "Mangler kundens replik eller playbook" }, { status: 400 });

  const variant = { key: `${approach}/christian-v3c`, approach, voice: VOICES.find((v) => v.key === "christian-v3c")! };
  const playbook = readFileSync(join(process.cwd(), APPROACHES[approach].file!), "utf8");
  const system = aiSaelgerSystemPrompt(variant, playbook, await adrianTrainingSection());
  const state: ToolState = { booked: b?.state?.booked ?? null, outcome: b?.state?.outcome ?? null, notes: b?.state?.notes ?? [], todayKey: new Date().toISOString().slice(0, 10) };

  // Jev: label + bryd ind (ca. 130 ms). Fejler Jev, svarer Adrian uden hint.
  let route: JevRoute | null = null;
  let jevError: string | null = null;
  try {
    route = await routeWithJev((jev ??= createJevClient()), kunde, b?.sidsteAgentReplik?.trim() || undefined);
  } catch (e) {
    jevError = e instanceof Error ? e.message : String(e);
  }

  const agentMsgs: Anthropic.MessageParam[] = b?.agentMsgs?.length
    ? [...b.agentMsgs, { role: "user", content: route ? withRouterHint(kunde, route.label, route.confidence) : kunde }]
    : [{ role: "user", content: leadMessage({ ...persona, answers: kunde }) }];

  const t0 = performance.now();
  try {
    const turn = await agentTurn({ client: createAnthropicClient(), system, agentMsgs, state, model });
    const out = { booked: state.booked, outcome: state.outcome, notes: state.notes };
    return NextResponse.json({ route, jevError, turn, adrianMs: Math.round(performance.now() - t0), agentMsgs, state: out, lead: persona.lead });
  } catch (e) {
    console.warn("[ai-saelger/samtale]", e instanceof Error ? e.message : e);
    return NextResponse.json({ route, jevError, error: e instanceof Error ? e.message : "Adrian kunne ikke svare" }, { status: 502 });
  }
}
