/**
 * Måler routeren på rigtige kundecitater (JSON-fil via --cases, ligger ikke i repoet): Jev (TypeSafe) mod
 * Claude Haiku. Choice: træfsikkerhed (præcis label / forsvarlig label) pr. label. Noul («bryd ind?»):
 * på hele turen og løbende hver 6. ord, som live. Svartid pr. kald (p50/p90).
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx --tsconfig tsconfig.json scripts/ai-saelger-router-eval.ts <ud-mappe> --cases <citater.json> [--haiku-model claude-haiku-5-5] [--skip-haiku]
 *
 * Kræver TYPESAFE_API_KEY; Haiku kører kun med ANTHROPIC_API_KEY. Skriver resultater.json og rapport.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { BARGE_IN_LABELS, parseRouterLabel, ROUTER_LABELS, routerSystemPrompt, type RouterLabel } from "@/lib/ai-saelger/router";
import { bargeInWithJev, createJevClient, JEV_MODEL, routeWithJev } from "@/lib/ai-saelger/router-jev";
import { expectedBargeIn, loadRouterCases, type RouterCase } from "@/lib/ai-saelger/practice/router-cases";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

type Row = { text: string; gold: RouterLabel; ok: RouterLabel[]; label: RouterLabel; bargeIn: number; ms: number; error?: string };

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "–");
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN;
}
const lat = (xs: number[]) => `p50 ${Math.round(quantile(xs, 0.5))} ms · p90 ${Math.round(quantile(xs, 0.9))} ms · maks ${Math.round(Math.max(...xs))} ms`;
const hit = (r: Row) => r.label === r.gold;
const okHit = (r: Row) => hit(r) || r.ok.includes(r.label);

function auc(pos: number[], neg: number[]): number {
  let s = 0;
  for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return pos.length && neg.length ? s / (pos.length * neg.length) : NaN;
}

let ROUTER_CASES: RouterCase[] = [];

async function runJev(): Promise<Row[]> {
  const client = createJevClient();
  await routeWithJev(client, "Okay.").catch(() => undefined); // opvarmning (TLS)
  const rows: Row[] = [];
  for (const c of ROUTER_CASES) {
    try {
      const r = await routeWithJev(client, c.text);
      rows.push({ text: c.text, gold: c.label, ok: c.ok ?? [], label: r.label, bargeIn: r.bargeIn, ms: r.ms });
    } catch (e) {
      rows.push({ text: c.text, gold: c.label, ok: c.ok ?? [], label: "andet", bargeIn: 0, ms: NaN, error: String(e) });
    }
  }
  return rows;
}

async function runHaiku(model: string): Promise<Row[]> {
  const client = createAnthropicClient();
  const system = routerSystemPrompt();
  const call = (text: string) => client.messages.create({ model, max_tokens: 12, system, messages: [{ role: "user", content: text }] });
  await call("Okay.").catch(() => undefined);
  const rows: Row[] = [];
  for (const c of ROUTER_CASES) {
    const t0 = performance.now();
    try {
      const m = await call(c.text);
      const ms = performance.now() - t0;
      const raw = m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const label = parseRouterLabel(raw);
      rows.push({ text: c.text, gold: c.label, ok: c.ok ?? [], label, bargeIn: BARGE_IN_LABELS.has(label) ? 1 : 0, ms });
    } catch (e) {
      rows.push({ text: c.text, gold: c.label, ok: c.ok ?? [], label: "andet", bargeIn: 0, ms: NaN, error: String(e) });
    }
  }
  return rows;
}

/** Live-mønster: Noul på kundens foreløbige tekst hver 6. ord. */
async function runJevLive(cases: readonly RouterCase[]) {
  const client = createJevClient();
  const out: { text: string; gold: boolean; steps: { words: number; p: number; ms: number }[] }[] = [];
  for (const c of cases) {
    const words = c.text.split(/\s+/);
    const steps: { words: number; p: number; ms: number }[] = [];
    for (let n = 6; n < words.length + 6; n += 6) {
      const k = Math.min(n, words.length);
      const r = await bargeInWithJev(client, words.slice(0, k).join(" "));
      steps.push({ words: k, p: r.p, ms: r.ms });
      if (k === words.length) break;
    }
    out.push({ text: c.text, gold: expectedBargeIn(c), steps });
  }
  return out;
}

function choiceSection(name: string, rows: Row[]): string {
  const valid = rows.filter((r) => !r.error);
  const lines = [
    `### ${name}`,
    `- Præcis label: **${pct(valid.filter(hit).length, valid.length)}** (${valid.filter(hit).length}/${valid.length}); forsvarlig label: **${pct(valid.filter(okHit).length, valid.length)}**`,
    `- Svartid: ${lat(valid.map((r) => r.ms))}${rows.length > valid.length ? ` · fejl: ${rows.length - valid.length}` : ""}`,
    "",
    "| Label | n | præcis | forsvarlig |",
    "|---|---|---|---|",
  ];
  for (const l of ROUTER_LABELS) {
    const g = valid.filter((r) => r.gold === l);
    if (g.length) lines.push(`| ${l} | ${g.length} | ${pct(g.filter(hit).length, g.length)} | ${pct(g.filter(okHit).length, g.length)} |`);
  }
  const miss = valid.filter((r) => !okHit(r));
  if (miss.length) {
    lines.push("", "Forkerte (heller ikke forsvarlige):", "");
    for (const r of miss) lines.push(`- «${r.text.slice(0, 120)}${r.text.length > 120 ? " …" : ""}» → \`${r.label}\` (facit \`${r.gold}\`)`);
  }
  return lines.join("\n");
}

function noulSection(name: string, rows: Row[], threshold = 0.5): string {
  const valid = rows.filter((r) => !r.error);
  const gold = (r: Row) => expectedBargeIn({ text: r.text, label: r.gold });
  const pos = valid.filter(gold), neg = valid.filter((r) => !gold(r));
  const tp = pos.filter((r) => r.bargeIn >= threshold).length, fp = neg.filter((r) => r.bargeIn >= threshold).length;
  return [
    `### ${name}`,
    `- Bryd ind (facit ja): ${tp}/${pos.length} fanget (${pct(tp, pos.length)}); falske indbrud: ${fp}/${neg.length} (${pct(fp, neg.length)}) ved tærskel ${threshold}`,
    `- AUC (rangordning): ${auc(pos.map((r) => r.bargeIn), neg.map((r) => r.bargeIn)).toFixed(2)}`,
  ].join("\n");
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir || outDir.startsWith("--")) throw new Error("Brug: scripts/ai-saelger-router-eval.ts <ud-mappe>");
  mkdirSync(outDir, { recursive: true });
  const casesPath = arg("cases");
  if (!casesPath) throw new Error("Mangler --cases <citater.json>");
  ROUTER_CASES = loadRouterCases(casesPath);
  const haikuModel = arg("haiku-model") ?? "claude-haiku-5-5";
  const withHaiku = !process.argv.includes("--skip-haiku") && !!process.env.ANTHROPIC_API_KEY?.trim();

  console.log(`Jev (${JEV_MODEL}): ${ROUTER_CASES.length} citater …`);
  const jev = await runJev();
  console.log("Jev live (Noul hver 6. ord) …");
  const live = await runJevLive(ROUTER_CASES.filter((c) => c.text.split(/\s+/).length > 6));
  let haiku: Row[] | null = null;
  if (withHaiku) {
    console.log(`Haiku (${haikuModel}) …`);
    haiku = await runHaiku(haikuModel);
  } else console.log("Springer Haiku over (ingen ANTHROPIC_API_KEY eller --skip-haiku).");

  // Live: hvornår bryder Jev ind, og falske indbrud undervejs
  const liveYes = live.filter((l) => l.gold), liveNo = live.filter((l) => !l.gold);
  const firstFire = liveYes.map((l) => l.steps.find((s) => s.p >= 0.5)?.words ?? null);
  const falseLive = liveNo.filter((l) => l.steps.some((s) => s.p >= 0.5)).length;
  const liveMs = live.flatMap((l) => l.steps.map((s) => s.ms));

  const md = [
    "# Router: Jev mod Claude Haiku på rigtige kundecitater",
    "",
    `${new Date().toISOString().slice(0, 10)} · ${ROUTER_CASES.length} kundereplikker fra jeres samtaler · Jev-model \`${JEV_MODEL}\`${haiku ? ` · Haiku \`${haikuModel}\`` : " · **Haiku ikke kørt** (ingen ANTHROPIC_API_KEY)"}`,
    "",
    "Svartider er målt fra testmaskinen (ét kald ad gangen, efter opvarmning) og indeholder netværk.",
    "",
    "## Choice (label fra menuen)",
    choiceSection(`Jev (Choice + Noul i ét kald)`, jev),
    ...(haiku ? ["", choiceSection(`Claude Haiku (${haikuModel})`, haiku)] : []),
    "",
    "## Noul: skal Adrian bryde ind?",
    noulSection("Jev, hele turen", jev),
    ...(haiku ? ["", noulSection("Haiku (bryd ind = label er forkert_antagelse/taler_for_meget)", haiku)] : []),
    "",
    "### Jev live (kun Noul, hver 6. ord)",
    `- ${live.length} replikker over 6 ord, ${liveMs.length} kald · svartid ${lat(liveMs)}`,
    `- Bryd ind fanget før/ved slutningen: ${firstFire.filter((x) => x !== null).length}/${liveYes.length}; første indbrud efter ord: ${firstFire.map((x) => x ?? "–").join(", ")}`,
    `- Falske indbrud undervejs (mindst ét kald ≥ 0,5 i en replik, hvor facit er nej): ${falseLive}/${liveNo.length} (${pct(falseLive, liveNo.length)})`,
  ].join("\n");

  writeFileSync(join(outDir, "rapport.md"), md + "\n");
  writeFileSync(join(outDir, "resultater.json"), JSON.stringify({ jev, haiku, live }, null, 2));
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
