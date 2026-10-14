/**
 * Øvebanen for AI-mødebookeren: hver playbook mod de simulerede kunder, med dommer.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ai-saelger-oevebane.ts <ud-mappe> [--playbooks lavt_pres,playbook_2] [--personas a,b] [--voice christian-v3c] [--model claude-sonnet-5-5]
 *
 * Hver samtale gemmes også som <navn>.json; findes den allerede i ud-mappen, genbruges den (så en afbrudt
 * kørsel kan fortsættes uden at betale igen). En samtale, der fejler (fx API-kredit), stopper ikke resten.
 *
 * Kræver ANTHROPIC_API_KEY eller ALLIO_ANTHROPIC_API_KEY (og ANTHROPIC_WORKSPACE_ID). Skriver én .md pr. samtale, resultater.json og
 * oversigt.md i ud-mappen. Rører ikke databasen.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { APPROACHES, VOICES, type ApproachKey } from "@/lib/ai-saelger/agents";
import { judgeCall, type JudgeResult } from "@/lib/ai-saelger/practice/judge";
import { PERSONAS } from "@/lib/ai-saelger/practice/personas";
import { AGENT_MODEL, AGENT_MODELS, simulateCall, transcriptText, type AgentModel, type SimResult } from "@/lib/ai-saelger/practice/simulate";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function pool<T>(items: readonly (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await items[i]!();
      }
    }),
  );
  return out;
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir || outDir.startsWith("--")) throw new Error("Brug: scripts/ai-saelger-oevebane.ts <ud-mappe> [--playbooks …] [--personas …]");
  mkdirSync(outDir, { recursive: true });
  const playbooks = (arg("playbooks")?.split(",") ?? (Object.keys(APPROACHES) as ApproachKey[])) as ApproachKey[];
  const personas = arg("personas") ? PERSONAS.filter((p) => arg("personas")!.split(",").includes(p.key)) : PERSONAS;
  const voice = VOICES.find((v) => v.key === (arg("voice") ?? "christian-v3c"))!;
  const todayKey = new Date().toISOString().slice(0, 10);
  const model = (arg("model") ?? AGENT_MODEL) as AgentModel;
  if (!(model in AGENT_MODELS)) throw new Error(`Ukendt model: ${model} (${Object.keys(AGENT_MODELS).join(", ")})`);
  const client = createAnthropicClient();

  type Row = { sim: SimResult; judge: JudgeResult | null; judgeCost: number; error?: string };
  const jobs = playbooks.flatMap((approach) => {
    const file = APPROACHES[approach].file;
    if (!file) return [];
    const playbook = readFileSync(file, "utf8");
    const variant = { key: `${approach}/${voice.key}`, approach, voice };
    return personas.map((persona) => async (): Promise<Row | null> => {
      const name = `${approach}--${persona.key}`;
      const saved = join(outDir, `${name}.json`);
      if (existsSync(saved)) {
        console.log(`${name}: genbrugt fra tidligere kørsel`);
        return JSON.parse(readFileSync(saved, "utf8")) as Row;
      }
      let sim: SimResult;
      try {
        sim = await simulateCall({ client, variant, playbook, persona, todayKey, model });
      } catch (e) {
        console.log(`${name}: FEJL (${String(e).slice(0, 160)})`);
        return null;
      }
      let judge: JudgeResult | null = null;
      let judgeCost = 0;
      let error: string | undefined;
      try {
        const j = await judgeCall(client, sim, playbook);
        judge = j.output as JudgeResult;
        judgeCost = j.costUsd;
      } catch (e) {
        error = String(e);
      }
      writeFileSync(
        join(outDir, `${name}.md`),
        `# ${APPROACHES[approach].label} · ${persona.key}\n\nBooket: ${sim.booked ? `${sim.booked.dag} kl. ${sim.booked.tid}` : "nej"} · Udfald: ${sim.outcome ?? "–"} · Sluttede: ${sim.endedBy} · Pris: $${(sim.costUsd + judgeCost).toFixed(3)}\n\n## Samtalen\n${transcriptText(sim.lines)}\n\n## Noter\n${sim.notes.map((n) => `- ${n}`).join("\n") || "–"}\n\n## Dommeren\n\`\`\`json\n${JSON.stringify(judge ?? error, null, 2)}\n\`\`\`\n`,
      );
      console.log(`${name}: ${sim.booked ? "BOOKET" : "ikke booket"} (${sim.lines.filter((l) => l.speaker !== "værktøj").length} replikker, $${(sim.costUsd + judgeCost).toFixed(3)})`);
      const row: Row = { sim, judge, judgeCost, error };
      writeFileSync(saved, JSON.stringify(row, null, 2));
      return row;
    });
  });

  const all = await pool(jobs, 4);
  const rows = all.filter((r): r is Row => r !== null);
  const failed = all.length - rows.length;
  writeFileSync(join(outDir, "resultater.json"), JSON.stringify(rows, null, 2));
  const total = rows.reduce((s, r) => s + r.sim.costUsd + r.judgeCost, 0);
  const byPb = playbooks.map((pb) => {
    const rs = rows.filter((r) => r.sim.variant.startsWith(`${pb}/`));
    const avg = (k: keyof JudgeResult["karakterer"]) => (rs.reduce((s, r) => s + (r.judge?.karakterer[k] ?? 0), 0) / Math.max(1, rs.length)).toFixed(1);
    return `| ${APPROACHES[pb].label} | ${rs.filter((r) => r.sim.booked).length}/${rs.length} | ${avg("aabning")} | ${avg("dialog_ikke_monolog")} | ${avg("indvendinger")} | ${avg("lukning")} | ${avg("menneskelig")} | ${rs.reduce((s, r) => s + (r.judge?.regelbrud.length ?? 0), 0)} |`;
  });
  writeFileSync(
    join(outDir, "oversigt.md"),
    `# Øvebanen ${todayKey}\n\nAdrian: ${model} · Stemme: ${voice.key} · Samtaler: ${rows.length}${failed ? ` (${failed} fejlede; kør igen for at fortsætte)` : ""} · Pris i alt: $${total.toFixed(2)}\n\n| Playbook | Booket | Åbning | Dialog | Indvendinger | Lukning | Menneskelig | Regelbrud |\n|---|---|---|---|---|---|---|---|\n${byPb.join("\n")}\n\n## Pr. samtale\n${rows.map((r) => `- **${r.sim.variant.split("/")[0]} · ${r.sim.persona}:** ${r.sim.booked ? "booket" : "ikke booket"}. ${r.judge?.hvorfor_udfaldet ?? r.error ?? ""}`).join("\n")}\n`,
  );
  console.log(`I alt $${total.toFixed(2)}`);
}

if (process.argv[1]?.endsWith("ai-saelger-oevebane.ts")) void main();
