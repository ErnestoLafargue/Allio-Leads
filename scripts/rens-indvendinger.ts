/**
 * Renser kundeindvendingerne fra de analyserede samtaler til citatbanken (lib/scripts-traening/quote-bank.ts):
 * Claude Haiku vurderer i batches, om hvert citat er en tydelig indvending, der kan forstås alene eller med
 * sælgerens replik lige før, og i hvilken kategori. Spørgsmål, brudstykker og småsnak sorteres fra.
 * Gemmer fremdrift efter hver batch i <arbejdsmappe>, så en afbrudt kørsel fortsætter uden at betale igen.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx --tsconfig tsconfig.json scripts/rens-indvendinger.ts <arbejdsmappe> [--gem]
 *
 * Uden --gem skrives kun til arbejdsmappen; med --gem gemmes banken i AppSetting (DATABASE_URL).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod/v4";
import { createAnthropicClient, structuredCall } from "@/lib/anthropic-client";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/call-analysis/schema";
import { prisma } from "@/lib/prisma";
import { QUOTE_BANK_SETTING_KEY, type BankQuote } from "@/lib/scripts-traening/quote-bank";

const MODEL = "claude-haiku-5-5";
const BATCH = 25;
const CATS = OBJECTION_CATEGORIES.filter((c) => c !== "other") as Exclude<ObjectionCategory, "other">[];

type Raw = { id: number; category: ObjectionCategory; customerLine: string; agentBefore: string | null };
type Verdict = { id: number; keep: boolean; category: string };

const Schema = z.object({
  verdicts: z.array(
    z.object({
      id: z.number().int(),
      keep: z.boolean().describe("true kun hvis citatet er en tydelig indvending/modstand, der giver mening alene eller med sælgerens replik før"),
      category: z.enum([...CATS, "ingen"]).describe("Den kategori, citatet bedst passer i; «ingen» hvis det ikke er en indvending"),
    }),
  ),
});

const SYSTEM = `Du sorterer kundereplikker fra danske salgsopkald (en mødebooker ringer til klinikker). De skal bruges som øvekort: «kunden siger X, hvordan svarer du?». Behold kun replikker, der er en TYDELIG indvending eller modstand, og som en sælger kan forstå og svare på alene (eller med sælgerens replik lige før, som står med).

Sortér fra (keep=false):
- brudstykker og halve sætninger uden mening alene («det, der, der er vi covered», «over det stresspunkt her»)
- almindelige spørgsmål uden modstand («hvor meget koster det?», «hvad hedder jeres firma?») — de er spørgsmål, ikke indvendinger
- småsnak, svar på spørgsmål, eller noget der kræver mere sammenhæng
- engelske replikker

Kategorier: has_booking_system (har/glad for bookingsystem, vil ikke skifte), has_agency (har bureau/nogen til markedsføring), no_time (har ikke tid nu), price (for dyrt, vil ikke bruge penge), send_email (send en mail), not_interested (ikke interesseret / ikke relevant), think_about_it (vil tænke over det), talk_to_partner (skal tale med partner/ejer), fully_booked (fuldt booket, mangler ikke kunder), bad_timing (dårligt tidspunkt, ring senere/efter ferien).
Svar for hvert id.`;

function clip(t: string | null, n = 200): string | null {
  if (!t) return null;
  const s = t.trim();
  if (s.length <= n) return s;
  const cut = s.slice(-n);
  return `… ${cut.slice(cut.indexOf(" ") + 1)}`;
}

async function collect(): Promise<Raw[]> {
  const rows = await prisma.callAnalysis.findMany({ select: { result: true, callRecording: { select: { transcript: { select: { segments: true } } } } } });
  const out: Raw[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const segs = (r.callRecording.transcript?.segments ?? []) as { speaker: string; text: string }[];
    for (const o of ((r.result as { objections?: { category: ObjectionCategory; customer?: { quote?: string; seg?: number } }[] }).objections ?? [])) {
      const q = o.customer?.quote?.trim();
      const words = q?.split(/\s+/).length ?? 0;
      if (!q || words < 3 || words > 40 || seen.has(q.toLowerCase())) continue;
      seen.add(q.toLowerCase());
      let before: string | null = null;
      const seg = o.customer?.seg;
      if (typeof seg === "number") for (let i = Math.min(seg, segs.length) - 1; i >= 0; i--) if (segs[i]?.speaker !== "customer") { before = segs[i]!.text; break; }
      out.push({ id: out.length, category: o.category, customerLine: q, agentBefore: clip(before) });
    }
  }
  return out;
}

async function main() {
  const dir = process.argv[2];
  if (!dir || dir.startsWith("--")) throw new Error("Brug: scripts/rens-indvendinger.ts <arbejdsmappe> [--gem]");
  mkdirSync(dir, { recursive: true });
  const rawPath = join(dir, "raa.json"), donePath = join(dir, "vurderinger.json");
  const raw: Raw[] = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, "utf8")) : await collect();
  writeFileSync(rawPath, JSON.stringify(raw));
  const verdicts: Verdict[] = existsSync(donePath) ? JSON.parse(readFileSync(donePath, "utf8")) : [];
  const done = new Set(verdicts.map((v) => v.id));
  const todo = raw.filter((r) => !done.has(r.id));
  console.log(`${raw.length} citater · ${done.size} allerede vurderet · ${todo.length} tilbage`);

  const client = createAnthropicClient();
  let cost = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const msg = batch.map((r) => `id ${r.id} [analysen sagde: ${r.category}]${r.agentBefore ? `\n  Sælgeren før: «${r.agentBefore}»` : ""}\n  Kunden: «${r.customerLine}»`).join("\n\n");
    try {
      const { output, costUsd } = await structuredCall({ client, system: SYSTEM, userMessage: msg, schema: Schema, maxTokens: 8000, model: MODEL, effort: "low" });
      cost += costUsd;
      const ids = new Set(batch.map((r) => r.id));
      verdicts.push(...output.verdicts.filter((v) => ids.has(v.id)));
      writeFileSync(donePath, JSON.stringify(verdicts));
      console.log(`batch ${i / BATCH + 1}: ${output.verdicts.filter((v) => v.keep).length}/${batch.length} beholdt · i alt $${cost.toFixed(4)}`);
    } catch (e) {
      console.log(`batch ${i / BATCH + 1} fejlede (kør igen for at fortsætte): ${String(e).slice(0, 200)}`);
    }
  }

  const byId = new Map(raw.map((r) => [r.id, r]));
  const bank: BankQuote[] = verdicts
    .filter((v) => v.keep && (CATS as string[]).includes(v.category))
    .map((v) => ({ category: v.category as BankQuote["category"], customerLine: byId.get(v.id)!.customerLine, agentBefore: byId.get(v.id)!.agentBefore }));
  writeFileSync(join(dir, "bank.json"), JSON.stringify(bank, null, 1));
  const per = CATS.map((c) => `${c}: ${bank.filter((q) => q.category === c).length}`).join(" · ");
  console.log(`Banken: ${bank.length} af ${raw.length} citater (${per}) · pris denne kørsel $${cost.toFixed(4)}`);
  if (process.argv.includes("--gem")) {
    await prisma.appSetting.upsert({ where: { key: QUOTE_BANK_SETTING_KEY }, create: { key: QUOTE_BANK_SETTING_KEY, value: JSON.stringify(bank) }, update: { value: JSON.stringify(bank) } });
    console.log(`Gemt i AppSetting «${QUOTE_BANK_SETTING_KEY}».`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
