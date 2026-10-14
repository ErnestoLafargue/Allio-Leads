/**
 * Måler routeren på rigtige kundecitater (JSON-fil via --cases, ligger ikke i repoet): Jev (TypeSafe) mod
 * Claude Haiku. Choice: træfsikkerhed (præcis label / forsvarlig label) pr. label. Noul («bryd ind?»):
 * på hele turen og løbende hver 6. ord, som live. Svartid pr. kald (p50/p90).
 *
 * Varianter: kun kundens tur, og med sælgerens sidste replik (`sidsteAgentReplik` i citatfilen), fx
 * «Passer torsdag eller fredag bedst?» før et tidsforslag. Noul måles ved tærskel 0,5 og 0,3, alene og
 * kombineret med, at Choice siger forkert_antagelse/taler_for_meget.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx --tsconfig tsconfig.json scripts/ai-saelger-router-eval.ts <ud-mappe> --cases <citater.json> [--haiku-model claude-haiku-5-5] [--skip-haiku]
 *
 * Kræver TYPESAFE_API_KEY; Haiku kører kun med ANTHROPIC_API_KEY (eller ALLIO_ANTHROPIC_API_KEY).
 * Skriver resultater.json og rapport.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { anthropicApiKey, createAnthropicClient } from "@/lib/anthropic-client";
import { BARGE_IN_LABELS, parseRouterLabel, ROUTER_LABELS, routerSystemPrompt, type RouterLabel } from "@/lib/ai-saelger/router";
import { bargeInWithJev, createJevClient, JEV_MODEL, routeWithJev } from "@/lib/ai-saelger/router-jev";
import { expectedBargeIn, loadRouterCases, type RouterCase } from "@/lib/ai-saelger/practice/router-cases";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

type Row = {
  text: string;
  gold: RouterLabel;
  ok: RouterLabel[];
  bryd: boolean;
  label: RouterLabel;
  /** Noul (Jev); for Haiku 1/0 ud fra label. */
  bargeIn: number;
  ms: number;
  error?: string;
};

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "–");
function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN;
}
const lat = (xs: number[]) => `p50 ${Math.round(quantile(xs, 0.5))} ms · p90 ${Math.round(quantile(xs, 0.9))} ms · maks ${Math.round(Math.max(...xs))} ms`;
const hit = (r: Row) => r.label === r.gold;
const okHit = (r: Row) => hit(r) || r.ok.includes(r.label);
const words = (t: string) => t.trim().split(/\s+/).length;

function auc(pos: number[], neg: number[]): number {
  let s = 0;
  for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return pos.length && neg.length ? s / (pos.length * neg.length) : NaN;
}

const prevOf = (c: RouterCase, withPrev: boolean) => (withPrev ? c.sidsteAgentReplik?.trim() || undefined : undefined);
const base = (c: RouterCase) => ({ text: c.text, gold: c.label, ok: c.ok ?? [], bryd: expectedBargeIn(c) });

async function runJev(cases: readonly RouterCase[], withPrev: boolean): Promise<Row[]> {
  const client = createJevClient();
  await routeWithJev(client, "Okay.").catch(() => undefined); // opvarmning (TLS)
  const rows: Row[] = [];
  for (const c of cases) {
    try {
      const r = await routeWithJev(client, c.text, prevOf(c, withPrev));
      rows.push({ ...base(c), label: r.label, bargeIn: r.bargeIn, ms: r.ms });
    } catch (e) {
      rows.push({ ...base(c), label: "andet", bargeIn: 0, ms: NaN, error: String(e) });
    }
  }
  return rows;
}

async function runHaiku(cases: readonly RouterCase[], model: string, withPrev: boolean): Promise<Row[]> {
  const client = createAnthropicClient();
  const system = routerSystemPrompt();
  const call = (content: string) => client.messages.create({ model, max_tokens: 12, system, messages: [{ role: "user", content }] });
  await call("Okay.").catch(() => undefined);
  const rows: Row[] = [];
  for (const c of cases) {
    const prev = prevOf(c, withPrev);
    const content = prev ? `Mødebookeren sagde: «${prev}»\nKundens seneste tur: «${c.text}»` : c.text;
    const t0 = performance.now();
    try {
      const m = await call(content);
      const ms = performance.now() - t0;
      const raw = m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const label = parseRouterLabel(raw);
      rows.push({ ...base(c), label, bargeIn: BARGE_IN_LABELS.has(label) ? 1 : 0, ms });
    } catch (e) {
      rows.push({ ...base(c), label: "andet", bargeIn: 0, ms: NaN, error: String(e) });
    }
  }
  return rows;
}

/**
 * Live-mønster: kundens foreløbige tekst hver 6. ord (med sælgerens sidste replik). Kun Noul (`p`, eget kald)
 * og Choice + Noul i ét kald (`label`, `p2`), så reglen «Noul og Choice» kan måles live.
 */
type LiveStep = { words: number; p: number; ms: number; label: RouterLabel; p2: number; ms2: number };
const liveErrors: string[] = [];
async function runJevLive(cases: readonly RouterCase[]) {
  const client = createJevClient();
  const out: { text: string; gold: boolean; steps: LiveStep[] }[] = [];
  for (const c of cases) {
    const ws = c.text.split(/\s+/);
    const steps: LiveStep[] = [];
    for (let n = 6; n < ws.length + 6; n += 6) {
      const k = Math.min(n, ws.length);
      const partial = ws.slice(0, k).join(" ");
      try {
        const r = await bargeInWithJev(client, partial, prevOf(c, true));
        const both = await routeWithJev(client, partial, prevOf(c, true));
        steps.push({ words: k, p: r.p, ms: r.ms, label: both.label, p2: both.bargeIn, ms2: both.ms });
      } catch (e) {
        liveErrors.push(String(e).slice(0, 160));
      }
      if (k === ws.length) break;
    }
    out.push({ text: c.text, gold: expectedBargeIn(c), steps });
  }
  return out;
}

function choiceSection(name: string, rows: Row[], other?: Row[]): string {
  const valid = rows.filter((r) => !r.error);
  const short = valid.filter((r) => words(r.text) <= 3);
  const lines = [
    `### ${name}`,
    `- Præcis label: **${pct(valid.filter(hit).length, valid.length)}** (${valid.filter(hit).length}/${valid.length}); forsvarlig label: **${pct(valid.filter(okHit).length, valid.length)}** (${valid.filter(okHit).length}/${valid.length})`,
    `- Korte svar (≤ 3 ord, n = ${short.length}): præcis ${pct(short.filter(hit).length, short.length)}, forsvarlig ${pct(short.filter(okHit).length, short.length)}`,
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
  if (other) {
    const flipsGood = valid.filter((r, i) => okHit(r) && !okHit(other[i]!)).length;
    const flipsBad = valid.filter((r, i) => !okHit(r) && okHit(other[i]!)).length;
    lines.push("", `Mod varianten uden replik: ${flipsGood} rettet, ${flipsBad} gjort forkerte (forsvarlig label).`);
  }
  return lines.join("\n");
}

type BargeRule = { name: string; fire: (r: Row) => boolean };
const BARGE_RULES: BargeRule[] = [
  { name: "Noul ≥ 0,5", fire: (r) => r.bargeIn >= 0.5 },
  { name: "Noul ≥ 0,3", fire: (r) => r.bargeIn >= 0.3 },
  { name: "Noul ≥ 0,3 ELLER Choice = forkert_antagelse/taler_for_meget", fire: (r) => r.bargeIn >= 0.3 || BARGE_IN_LABELS.has(r.label) },
  { name: "Noul ≥ 0,3 OG Choice = forkert_antagelse/taler_for_meget", fire: (r) => r.bargeIn >= 0.3 && BARGE_IN_LABELS.has(r.label) },
  { name: "Kun Choice = forkert_antagelse/taler_for_meget", fire: (r) => BARGE_IN_LABELS.has(r.label) },
];

function noulTable(name: string, rows: Row[], rules: BargeRule[] = BARGE_RULES): string {
  const valid = rows.filter((r) => !r.error);
  const pos = valid.filter((r) => r.bryd), neg = valid.filter((r) => !r.bryd);
  const lines = [`### ${name}`, "", "| Regel | fanget (facit ja) | falske indbrud (facit nej) |", "|---|---|---|"];
  for (const rule of rules) {
    const tp = pos.filter(rule.fire).length, fp = neg.filter(rule.fire).length;
    lines.push(`| ${rule.name} | ${tp}/${pos.length} (${pct(tp, pos.length)}) | ${fp}/${neg.length} (${pct(fp, neg.length)}) |`);
  }
  if (rules === BARGE_RULES) lines.push("", `AUC for Noul (rangordning): ${auc(pos.map((r) => r.bargeIn), neg.map((r) => r.bargeIn)).toFixed(2)}`);
  return lines.join("\n");
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir || outDir.startsWith("--")) throw new Error("Brug: scripts/ai-saelger-router-eval.ts <ud-mappe>");
  mkdirSync(outDir, { recursive: true });
  const casesPath = arg("cases");
  if (!casesPath) throw new Error("Mangler --cases <citater.json>");
  const cases = loadRouterCases(casesPath);
  const hasPrev = cases.some((c) => c.sidsteAgentReplik?.trim());
  const haikuModel = arg("haiku-model") ?? "claude-haiku-5-5";
  const withHaiku = !process.argv.includes("--skip-haiku") && !!anthropicApiKey();

  console.log(`Jev (${JEV_MODEL}): ${cases.length} citater …`);
  const jev = await runJev(cases, false);
  const jevPrev = hasPrev ? (console.log("Jev med sælgerens sidste replik …"), await runJev(cases, true)) : null;
  console.log("Jev live (Noul hver 6. ord) …");
  const live = await runJevLive(cases.filter((c) => words(c.text) > 6));
  let haiku: Row[] | null = null, haikuPrev: Row[] | null = null;
  if (withHaiku) {
    console.log(`Haiku (${haikuModel}) …`);
    haiku = await runHaiku(cases, haikuModel, false);
    if (hasPrev) haikuPrev = await runHaiku(cases, haikuModel, true);
  } else console.log("Springer Haiku over (ingen Anthropic-nøgle eller --skip-haiku).");

  // Live: hvornår bryder Jev ind, og falske indbrud undervejs
  const liveYes = live.filter((l) => l.gold), liveNo = live.filter((l) => !l.gold);
  const liveMs = live.flatMap((l) => l.steps.map((s) => s.ms));
  const liveMs2 = live.flatMap((l) => l.steps.map((s) => s.ms2));
  const liveLine = (name: string, fire: (s: LiveStep) => boolean) => {
    const first = liveYes.map((l) => l.steps.find(fire)?.words ?? null);
    const falseLive = liveNo.filter((l) => l.steps.some(fire)).length;
    return `| ${name} | ${first.filter((x) => x !== null).length}/${liveYes.length} | ${first.map((x) => x ?? "–").join(", ")} | ${falseLive}/${liveNo.length} (${pct(falseLive, liveNo.length)}) |`;
  };

  const md = [
    "# Router: Jev mod Claude Haiku på rigtige kundecitater",
    "",
    `${new Date().toISOString().slice(0, 10)} · ${cases.length} kundereplikker fra jeres samtaler · Jev-model \`${JEV_MODEL}\`${haiku ? ` · Haiku \`${haikuModel}\`` : " · **Haiku ikke kørt** (ingen Anthropic-nøgle)"}`,
    "",
    "Svartider er målt fra testmaskinen (ét kald ad gangen, efter opvarmning) og indeholder netværk.",
    "",
    "## Choice (label fra menuen)",
    choiceSection("Jev, kun kundens tur (Choice + Noul i ét kald)", jev),
    ...(jevPrev ? ["", choiceSection("Jev med sælgerens sidste replik (sidsteAgentReplik)", jevPrev, jev)] : []),
    ...(haiku ? ["", choiceSection(`Claude Haiku (${haikuModel}), kun kundens tur`, haiku)] : []),
    ...(haikuPrev ? ["", choiceSection(`Claude Haiku (${haikuModel}) med sælgerens sidste replik`, haikuPrev, haiku!)] : []),
    "",
    "## Noul: skal Adrian bryde ind? (hele turen)",
    noulTable("Jev, kun kundens tur", jev),
    ...(jevPrev ? ["", noulTable("Jev med sælgerens sidste replik", jevPrev)] : []),
    ...(haiku ? ["", noulTable("Haiku (bryd ind = label er forkert_antagelse/taler_for_meget)", haiku, BARGE_RULES.slice(-1))] : []),
    "",
    "### Jev live (hver 6. ord, med sælgerens sidste replik)",
    `- ${live.length} replikker over 6 ord, ${liveMs.length} trin · kun Noul: ${lat(liveMs)} · Choice + Noul: ${lat(liveMs2)}${liveErrors.length ? ` · fejl/timeout (> 3 s): ${liveErrors.length}` : ""}`,
    "",
    "| Regel | bryd ind fanget | første indbrud efter ord | falske indbrud undervejs |",
    "|---|---|---|---|",
    liveLine("Kun Noul ≥ 0,5", (s) => s.p >= 0.5),
    liveLine("Kun Noul ≥ 0,3", (s) => s.p >= 0.3),
    liveLine("Choice + Noul: Noul ≥ 0,3", (s) => s.p2 >= 0.3),
    liveLine("Choice + Noul: Noul ≥ 0,3 OG Choice = forkert_antagelse/taler_for_meget", (s) => s.p2 >= 0.3 && BARGE_IN_LABELS.has(s.label)),
    liveLine("Choice + Noul: Noul ≥ 0,3 ELLER Choice = forkert_antagelse/taler_for_meget", (s) => s.p2 >= 0.3 || BARGE_IN_LABELS.has(s.label)),
  ].join("\n");

  writeFileSync(join(outDir, "rapport.md"), md + "\n");
  writeFileSync(join(outDir, "resultater.json"), JSON.stringify({ jev, jevPrev, haiku, haikuPrev, live }, null, 2));
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
