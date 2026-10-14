/**
 * Øvebanen: AI-mødebookeren (Claude Haiku 5.5, samme systemprompt og værktøjer som i telefonen) taler
 * med en simuleret kunde (Claude Opus 5.5) indtil nogen lægger på. Værktøjerne simuleres (falsk
 * kalender, ingen rigtig booking). Bagefter vurderer en dommer samtalen (judge.ts).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { usageCostUsd } from "@/lib/anthropic-client";
import type { Variant } from "../agents";
import { pitchNumbers } from "../pitch-numbers";
import { proposeTwo, type DaySlots } from "../slot-order";
import { aiSaelgerSystemPrompt } from "../system-prompt";
import { AI_SAELGER_TOOLS } from "../tools";
import { customerSystemPrompt, type Persona } from "./personas";

export const AGENT_MODEL = "claude-haiku-5-5";
export const CUSTOMER_MODEL = "claude-opus-5-5";
const HANGUP = "[LÆGGER PÅ]";

export type Line = { speaker: "agent" | "kunde" | "værktøj"; text: string };
export type SimResult = {
  persona: string;
  variant: string;
  lines: Line[];
  booked: { dag: string; tid: string; adresse: string } | null;
  outcome: string | null;
  notes: string[];
  endedBy: "kunde" | "agent" | "max_ture";
  costUsd: number;
};

/** Falsk kalender: alle hverdage de næste 14 dage, kl. 9–15 hver hele time. */
export function fakeCalendar(todayKey: string): DaySlots[] {
  const out: DaySlots[] = [];
  const start = new Date(`${todayKey}T12:00:00Z`).getTime();
  for (let i = 1; i <= 14; i++) {
    const dayKey = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ dayKey, times: ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"] });
  }
  return out;
}

/** Det, værktøjerne ændrer i løbet af samtalen (simuleret: ingen rigtig booking). */
export type ToolState = { booked: SimResult["booked"]; outcome: string | null; notes: string[]; todayKey: string };

function runTool(name: string, input: Record<string, unknown>, state: ToolState): string {
  switch (name) {
    case "find_ledige_tider": {
      const two = proposeTwo(state.todayKey, fakeCalendar(state.todayKey), { allowMondayTuesday: Boolean(input.tillad_mandag_tirsdag) });
      return JSON.stringify({ forslag: two, oevrige_tider_samme_dage: ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"], specialist: "Victor" });
    }
    case "beregn_potentiale": {
      const n = pitchNumbers(Number(input.kunder_i_kartotek) || 0);
      const pris = Number(input.pris_pr_behandling) || null;
      return JSON.stringify({ ...n, kroner_pr_maaned: pris ? n.rebookingsPerMonth * pris : null });
    }
    case "book_moede":
      state.booked = { dag: String(input.dag), tid: String(input.tid), adresse: String(input.adresse ?? "") };
      return JSON.stringify({ ok: true, specialist: "Victor" });
    case "skriv_note":
      state.notes.push(String(input.note));
      return "ok";
    case "saet_udfald":
      state.outcome = String(input.udfald);
      return "ok";
    default:
      return "ok";
  }
}

export function leadMessage(p: Persona): string {
  const l = p.lead;
  return `## Leadet
Klinik: ${l.kliniknavn} (${l.branche}), ${l.by}
Beslutningstager: ${l.beslutningstager}
Bookingsystem: ${l.bookingsystem}
(Antal kunder, pris pr. behandling og hvor længe de har brugt systemet kendes ikke; spørg.)

## Opkaldet er forbundet. Den, der tager telefonen, siger:
«${p.answers}»`;
}

/** Modeller, Adrian kan køre på. Thinking slås fra (eller holdes lavt), fordi han skal svare hurtigt. */
export const AGENT_MODELS = {
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", params: { max_tokens: 600, thinking: { type: "disabled" } } },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", params: { max_tokens: 2000, thinking: { type: "between_tools" }, output_config: { effort: "low" } } },
  "claude-opus-5-5": { label: "Claude Opus 5.5", params: { max_tokens: 4000, output_config: { effort: "low" } } },
} as const;
export type AgentModel = keyof typeof AGENT_MODELS;

export type AgentTurn = { spoken: string; tools: { name: string; input: Record<string, unknown> }[]; hangup: boolean; costUsd: number };

/**
 * Én tur for Adrian: kalder modellen (med værktøjer) til han har noget at sige. `agentMsgs` udvides på
 * stedet med hans svar og værktøjsresultaterne.
 */
export async function agentTurn(params: {
  client: Anthropic;
  system: string;
  agentMsgs: Anthropic.MessageParam[];
  state: ToolState;
  model?: AgentModel;
}): Promise<AgentTurn> {
  const model = params.model ?? AGENT_MODEL;
  const spokenParts: string[] = [];
  const tools: AgentTurn["tools"] = [];
  let hangup = false;
  let costUsd = 0;
  for (let step = 0; step < 6; step++) {
    const res = await params.client.messages.create({
      ...(AGENT_MODELS[model].params as Partial<Anthropic.MessageCreateParamsNonStreaming>),
      max_tokens: AGENT_MODELS[model].params.max_tokens,
      model,
      system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
      tools: AI_SAELGER_TOOLS,
      messages: params.agentMsgs,
    });
    costUsd += usageCostUsd(res.usage, model);
    params.agentMsgs.push({ role: "assistant", content: res.content });
    spokenParts.push(...res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])));
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) break;
    const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
      if (u.name === "afslut_samtale") hangup = true;
      const input = u.input as Record<string, unknown>;
      tools.push({ name: u.name, input });
      return { type: "tool_result", tool_use_id: u.id, content: runTool(u.name, input, params.state) };
    });
    params.agentMsgs.push({ role: "user", content: results });
    if (hangup) break;
  }
  return { spoken: spokenParts.join(" ").replace(/\s+/g, " ").trim(), tools, hangup, costUsd };
}

export async function simulateCall(params: {
  client: Anthropic;
  variant: Variant;
  playbook: string;
  persona: Persona;
  todayKey: string;
  maxAgentTurns?: number;
  /** Adrians model (standard Haiku). */
  model?: AgentModel;
}): Promise<SimResult> {
  const { client, variant, persona } = params;
  const result: SimResult = { persona: persona.key, variant: variant.key, lines: [{ speaker: "kunde", text: persona.answers }], booked: null, outcome: null, notes: [], endedBy: "max_ture", costUsd: 0 };
  const state: ToolState = { booked: null, outcome: null, notes: result.notes, todayKey: params.todayKey };
  const system = aiSaelgerSystemPrompt(variant, params.playbook);
  const customerSystem = customerSystemPrompt(persona);

  const agentMsgs: Anthropic.MessageParam[] = [{ role: "user", content: leadMessage(persona) }];
  const customerMsgs: Anthropic.MessageParam[] = [];

  for (let turn = 0; turn < (params.maxAgentTurns ?? 24); turn++) {
    // Agentens tur (inkl. værktøjskald, til den har noget at sige).
    const t = await agentTurn({ client, system, agentMsgs, state, model: params.model });
    result.costUsd += t.costUsd;
    for (const u of t.tools) result.lines.push({ speaker: "værktøj", text: `${u.name} ${JSON.stringify(u.input)}` });
    result.booked = state.booked;
    result.outcome = state.outcome;
    const spoken = t.spoken;
    if (spoken) result.lines.push({ speaker: "agent", text: spoken });
    if (t.hangup) {
      result.endedBy = "agent";
      break;
    }

    // Kundens tur.
    customerMsgs.push({ role: "user", content: spoken || "(stilhed)" });
    const c = await client.messages.create({
      model: CUSTOMER_MODEL,
      // Opus 5.5 tænker altid; med et lille max_tokens går hele budgettet til thinking, og svaret bliver tomt.
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: [{ type: "text", text: customerSystem, cache_control: { type: "ephemeral" } }],
      messages: customerMsgs,
    });
    result.costUsd += usageCostUsd(c.usage, CUSTOMER_MODEL);
    const said = c.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
    customerMsgs.push({ role: "assistant", content: said || "…" });
    const ended = said.includes(HANGUP);
    const text = said.replace(HANGUP, "").trim();
    result.lines.push({ speaker: "kunde", text: text || "(stilhed)" });
    if (ended) {
      result.endedBy = "kunde";
      break;
    }
    agentMsgs.push({ role: "user", content: text || "(stilhed)" });
  }
  return result;
}

export function transcriptText(lines: readonly Line[]): string {
  return lines.map((l) => `${l.speaker === "agent" ? "Agent" : l.speaker === "kunde" ? "Kunde" : "  [værktøj]"}: ${l.text}`).join("\n");
}
