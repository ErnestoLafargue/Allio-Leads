import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { APPROACHES, VOICES, type ApproachKey } from "@/lib/ai-saelger/agents";
import { resolveVoice } from "@/lib/ai-saelger/custom-voices";
import { PERSONAS } from "@/lib/ai-saelger/practice/personas";
import { AGENT_MODELS, agentTurn, agentTurnStream, leadMessage, type AgentModel, type ToolState } from "@/lib/ai-saelger/practice/simulate";
import { withRouterHint } from "@/lib/ai-saelger/router";
import { relevantLessonsHint } from "@/lib/ai-saelger/training";
import { createJevClient, routeWithJev, type JevRoute } from "@/lib/ai-saelger/router-jev";
import { readPlaybook } from "@/lib/ai-saelger/playbooks";
import { aiSaelgerSystemPrompt } from "@/lib/ai-saelger/system-prompt";
import { adrianTraining } from "@/lib/ai-saelger/training-db";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { getViewer } from "@/lib/scripts-traening/queries";

export const maxDuration = 60;

/** Genbruges mellem kald, så Jev ikke skal åbne en ny forbindelse hver gang (ca. 500 → 130 ms). */
let jev: ReturnType<typeof createJevClient> | null = null;

type Lead = { kliniknavn: string; by: string; beslutningstager: string; bookingsystem: string; branche: string };

type Body = {
  approach?: string;
  /** Klinikken, Adrian ringer til (du selv). Uden: øvebanens første lead. */
  lead?: Partial<Lead>;
  /** Adrians stemme (VOICES), styrer navnet han siger. */
  voiceKey?: string;
  personaKey?: string;
  model?: string;
  /** Kundens replik (første gang: det, kunden siger, når telefonen tages). */
  kunde?: string;
  /** Adrians seneste replik (til Jev). */
  sidsteAgentReplik?: string;
  /** Samtalen indtil nu (Claude-beskeder), sendes frem og tilbage af siden. */
  agentMsgs?: Anthropic.MessageParam[];
  state?: Omit<ToolState, "todayKey">;
  /** true: svar som NDJSON-strøm (route → sentence … → done), så stemmen kan starte på første sætning. */
  stream?: boolean;
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
  const base = PERSONAS.find((p) => p.key === b?.personaKey) ?? PERSONAS[0]!;
  const clean = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : fallback);
  const persona = {
    ...base,
    lead: b?.lead
      ? {
          kliniknavn: clean(b.lead.kliniknavn, base.lead.kliniknavn),
          by: clean(b.lead.by, base.lead.by),
          beslutningstager: clean(b.lead.beslutningstager, base.lead.beslutningstager),
          bookingsystem: clean(b.lead.bookingsystem, base.lead.bookingsystem),
          branche: clean(b.lead.branche, base.lead.branche),
        }
      : base.lead,
  };
  const model = (b?.model && b.model in AGENT_MODELS ? b.model : "claude-haiku-5-5") as AgentModel;
  if (!kunde || !APPROACHES[approach]?.file) return NextResponse.json({ error: "Mangler kundens replik eller playbook" }, { status: 400 });

  const voice = (await resolveVoice(b?.voiceKey)) ?? VOICES.find((v) => v.key === "christian-v3c")!;
  const variant = { key: `${approach}/${voice.key}`, approach, voice };
  const playbook = readPlaybook(approach);
  const state: ToolState = { booked: b?.state?.booked ?? null, outcome: b?.state?.outcome ?? null, notes: b?.state?.notes ?? [], todayKey: new Date().toISOString().slice(0, 10) };

  // Jev (label + bryd ind, ca. 130 ms) og træningen hentes samtidig. Fejler Jev, svarer Adrian uden hint.
  const tPrep = performance.now();
  let route: JevRoute | null = null;
  let jevError: string | null = null;
  const [training] = await Promise.all([
    adrianTraining(),
    routeWithJev((jev ??= createJevClient()), kunde, b?.sidsteAgentReplik?.trim() || undefined).then(
      (r) => void (route = r),
      (e: unknown) => void (jevError = e instanceof Error ? e.message : String(e)),
    ),
  ]);
  const system = aiSaelgerSystemPrompt(variant, playbook, training.section);
  const prepMs = Math.round(performance.now() - tPrep);
  const label = (route as JevRoute | null)?.label;

  const agentMsgs: Anthropic.MessageParam[] = b?.agentMsgs?.length
    ? [
        ...b.agentMsgs,
        {
          role: "user",
          content: [route ? withRouterHint(kunde, (route as JevRoute).label, (route as JevRoute).confidence) : kunde, relevantLessonsHint(training.lessons, label)]
            .filter(Boolean)
            .join("\n\n"),
        },
      ]
    : [{ role: "user", content: leadMessage({ ...persona, answers: kunde }) }];

  const t0 = performance.now();
  if (b?.stream) {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        send({ type: "route", route, jevError });
        let firstSentenceMs: number | null = null;
        try {
          const turn = await agentTurnStream({
            client: createAnthropicClient(),
            system,
            agentMsgs,
            state,
            model,
            onSentence: (text) => {
              firstSentenceMs ??= Math.round(performance.now() - t0);
              send({ type: "sentence", text, ms: Math.round(performance.now() - t0) });
            },
            onTool: (tool) => send({ type: "tool", ...tool }),
          });
          send({
            type: "done",
            turn,
            adrianMs: Math.round(performance.now() - t0),
            firstSentenceMs,
            timings: { prepMs, jevMs: (route as JevRoute | null)?.ms ?? null, ...turn.timings, systemChars: system.length },
            agentMsgs,
            state: { booked: state.booked, outcome: state.outcome, notes: state.notes },
          });
        } catch (e) {
          console.warn("[ai-saelger/samtale]", e instanceof Error ? e.message : e);
          send({ type: "error", error: e instanceof Error ? e.message : "Adrian kunne ikke svare" });
        }
        controller.close();
      },
    });
    return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  }
  try {
    const turn = await agentTurn({ client: createAnthropicClient(), system, agentMsgs, state, model });
    const out = { booked: state.booked, outcome: state.outcome, notes: state.notes };
    return NextResponse.json({ route, jevError, turn, adrianMs: Math.round(performance.now() - t0), agentMsgs, state: out, lead: persona.lead });
  } catch (e) {
    console.warn("[ai-saelger/samtale]", e instanceof Error ? e.message : e);
    return NextResponse.json({ route, jevError, error: e instanceof Error ? e.message : "Adrian kunne ikke svare" }, { status: 502 });
  }
}
