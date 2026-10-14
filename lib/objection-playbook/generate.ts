/**
 * Bygger indvendingsbogen i tre trin:
 *  1. Sonnet finder de 30 hyppigste indvendingstyper ud fra kundernes egne ord.
 *  2. Haiku placerer hver indvending i en type.
 *  3. Sonnet analyserer hver type ud fra de bedste og dårligste rigtige behandlinger og skriver en
 *     skabelon, som live-coachen tilpasser den enkelte kunde.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ALLIO_HARD_RULES, ALLIO_PRODUCT } from "@/lib/allio-product";
import { structuredCall } from "@/lib/anthropic-client";
import { OBJECTION_LABELS } from "@/lib/scripts-traening/labels";
import { prisma } from "@/lib/prisma";
import { bestCandidates, bookingRates, collectObjections, worstCandidates, type CollectedObjection } from "./collect";
import {
  ClassifySchema,
  EntryAnalysisSchema,
  PLAYBOOK_KIND,
  PLAYBOOK_PROMPT_VERSION,
  PLAYBOOK_SIZE,
  TaxonomySchema,
  type PlaybookEntry,
  type PlaybookExample,
  type PlaybookStats,
  type PlaybookType,
} from "./schema";

export const PLAYBOOK_MODEL = "claude-sonnet-5-5";
export const CLASSIFY_MODEL = "claude-haiku-5-5";

const ALLIO_CONTEXT = `${ALLIO_PRODUCT}

Sælgerens eneste mål i opkaldet er et ja til et møde, hvor en specialist viser klinikken, hvad der er at hente ud fra dens egne data. Nævn aldrig mødets længde.
God samtale-rækkefølge: forstå → forklar → behandl indvendinger → luk. Der lukkes først, når ingen indvending står åben.`;

const TAXONOMY_SYSTEM = `Du analyserer indvendinger fra danske telefonsamtaler, hvor sælgere fra Allio ringer til klinikker (skønhed, massage, fysioterapi, tandlæger m.fl.) for at booke et møde.
${ALLIO_CONTEXT}

Opgave: Find præcis ${PLAYBOOK_SIZE} indvendingstyper, der tilsammen dækker flest mulige af kundernes indvendinger. En type er finere end kategorien: fx er «ikke interesseret» for groft — del den op efter, hvad kunden reelt mener (fx «vi har nok kunder», «vi får ikke noget ud af den slags», «afviser før de har hørt hvad det er»). Typer, der kun forekommer 1–2 gange, er ikke med. Sortér efter hyppighed. Titlen skal være i kundens typiske ordlyd.`;

const CLASSIFY_SYSTEM = `Du placerer kundeindvendinger fra salgsopkald i den type, der passer bedst. Vælg den nærmeste type, også selv om ordlyden er en anden — det er kundens mening, der tæller. Svar kun «none», hvis indvendingen slet ikke ligner nogen af typerne. Svar for hver eneste indvending.`;

const ENTRY_SYSTEM = `Du er salgstræner for Allios mødebookere og skriver ét opslag i deres indvendingsbog.
${ALLIO_CONTEXT}

Du får én indvendingstype med rigtige eksempler fra deres samtaler: kundens ord, sælgerens svar, kundens reaktion lige efter, om samtalen endte med et møde, og analysens vurdering af behandlingen.
- Vælg det bedste og det dårligste eksempel ud fra kundens reaktion og resultatet — ikke ud fra hvor pænt svaret lyder.
- Analysen skal forklare, hvad der adskiller de gode svar fra de dårlige, med udgangspunkt i eksemplerne. Nævn aldrig id'er i teksten.
- Skabelonen er det svar, sælgerne skal tage udgangspunkt i. Højst 3 korte sætninger i dansk talesprog, til at sige højt. Brug [pladsholdere] i firkantede parenteser for det, der skal tilpasses kunden (fx [kundens bookingsystem], [det kunden lige sagde], [to dage]). Ingen floskler («jeg forstår din bekymring»). Følg pris-reglen.
- Spil på den Allio-funktion, der passer til indvendingen (se «Vælg den funktion, der passer til kunden») — ikke altid genaktivering. Hold dig til produktviden; lov intet ud over den.
- Vælg det første træk: sporg (indvendingen er uklar/et røgslør — afdæk først), forklar (kunden mangler at forstå, hvad det er), behandl (reel indvending — anerkend, vend mod værdien, valg mod mødet) eller luk (sjældent for en indvending). Skabelonen følger trækket; kun behandl og luk må slutte med et valg mellem to tidspunkter.

${ALLIO_HARD_RULES}`;

const fmt = (o: CollectedObjection) =>
  [
    `[${o.id}] behandling: ${o.handling} · ${o.booked ? "endte med møde" : "intet møde"}`,
    `  Kunde: «${o.customer}»`,
    `  Sælger: ${o.response ? `«${o.response}»` : "(intet svar)"}`,
    o.reaction ? `  Kundens reaktion: «${o.reaction}»` : null,
    o.note ? `  Analysens note: ${o.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

async function taxonomy(client: Anthropic, objections: readonly CollectedObjection[]) {
  const byCategory = new Map<string, CollectedObjection[]>();
  for (const o of objections) byCategory.set(o.category, [...(byCategory.get(o.category) ?? []), o]);
  const blocks = [...byCategory]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cat, list]) => `## ${cat} (${OBJECTION_LABELS[cat as keyof typeof OBJECTION_LABELS] ?? cat}) — ${list.length} stk.\n${list.map((o) => `- ${o.customer}`).join("\n")}`);
  const { output, costUsd } = await structuredCall({
    client,
    model: PLAYBOOK_MODEL,
    system: TAXONOMY_SYSTEM,
    userMessage: `Her er alle ${objections.length} indvendinger (kundens ord), grupperet efter kategori:\n\n${blocks.join("\n\n")}\n\nFind de ${PLAYBOOK_SIZE} typer nu.`,
    schema: TaxonomySchema,
    maxTokens: 24000,
  });
  const seen = new Set<string>();
  const types = output.types.filter((t) => !seen.has(t.key) && seen.add(t.key)).slice(0, PLAYBOOK_SIZE);
  return { types, costUsd };
}

async function classify(client: Anthropic, objections: readonly CollectedObjection[], types: readonly PlaybookType[]) {
  const typeList = types.map((t) => `- ${t.key} (${t.category}): ${t.title} — ${t.description}`).join("\n");
  const result = new Map<string, string>();
  let costUsd = 0;
  const CHUNK = 60;
  for (let i = 0; i < objections.length; i += CHUNK) {
    const chunk = objections.slice(i, i + CHUNK);
    // Korte løbenumre i stedet for lange id'er — færre tokens og færre fejl.
    const { output, costUsd: c } = await structuredCall({
      client,
      model: CLASSIFY_MODEL,
      system: `${CLASSIFY_SYSTEM}\n\nTyperne:\n${typeList}`,
      userMessage: chunk.map((o, j) => `[${j + 1}] (${o.category}) «${o.customer}»`).join("\n"),
      schema: ClassifySchema,
      maxTokens: 16000,
      effort: "medium",
    });
    costUsd += c;
    const keys = new Set(types.map((t) => t.key));
    for (const it of output.items) {
      const o = chunk[Number(it.id.replace(/\D/g, "")) - 1];
      if (o && keys.has(it.type)) result.set(o.id, it.type);
    }
  }
  return { assignment: result, costUsd };
}

const toExample = (o: CollectedObjection | undefined): PlaybookExample | null =>
  o
    ? { id: o.id, callRecordingId: o.callRecordingId, t: o.t, customer: o.customer, response: o.response, reaction: o.reaction, handling: o.handling, booked: o.booked }
    : null;

async function analyseType(client: Anthropic, type: PlaybookType, items: readonly CollectedObjection[]) {
  const best = bestCandidates(items);
  const worst = worstCandidates(items);
  const rates = bookingRates(items);
  const pct = (x: number | null) => (x === null ? "for få" : `${Math.round(x * 100)} %`);
  const { output, costUsd } = await structuredCall({
    client,
    model: PLAYBOOK_MODEL,
    system: ENTRY_SYSTEM,
    userMessage: [
      `# Indvending: ${type.title}`,
      `Kategori: ${type.category} · ${type.description}`,
      `Forekommer ${items.length} gange. Møde booket: ${pct(rates.bookedGood)} ved god behandling (${rates.nGood}), ${pct(rates.bookedBad)} ved svag/ingen (${rates.nBad}).`,
      "",
      "## Kandidater til bedste behandling",
      best.map(fmt).join("\n\n") || "(ingen)",
      "",
      "## Kandidater til dårligste behandling",
      worst.map(fmt).join("\n\n") || "(ingen)",
      "",
      "Skriv opslaget nu. bestId og worstId skal være id'er fra listerne ovenfor.",
    ].join("\n"),
    schema: EntryAnalysisSchema,
    maxTokens: 12000,
  });
  const { bestId, worstId, ...analysis } = output;
  return {
    analysis,
    best: toExample(best.find((o) => o.id === bestId) ?? best[0]),
    worst: toExample(worst.find((o) => o.id === worstId) ?? worst[0]),
    rates,
    costUsd,
  };
}

export async function buildPlaybook(client: Anthropic, log: (m: string) => void = () => {}) {
  const { objections, calls } = await collectObjections();
  log(`${objections.length} indvendinger fra ${calls} salgssamtaler`);
  const tax = await taxonomy(client, objections);
  log(`${tax.types.length} typer ($${tax.costUsd.toFixed(3)})`);
  const cls = await classify(client, objections, tax.types);
  log(`${cls.assignment.size} placeret i en type ($${cls.costUsd.toFixed(3)})`);

  const byType = new Map<string, CollectedObjection[]>();
  for (const o of objections) {
    const key = cls.assignment.get(o.id);
    if (key) byType.set(key, [...(byType.get(key) ?? []), o]);
  }
  const ranked = tax.types.filter((t) => (byType.get(t.key)?.length ?? 0) > 0).sort((a, b) => byType.get(b.key)!.length - byType.get(a.key)!.length);

  let costUsd = tax.costUsd + cls.costUsd;
  const entries: PlaybookEntry[] = [];
  for (const [i, type] of ranked.entries()) {
    const items = byType.get(type.key)!;
    const r = await analyseType(client, type, items);
    costUsd += r.costUsd;
    entries.push({ ...type, ...r.analysis, ...r.rates, rank: i + 1, count: items.length, share: items.length / objections.length, best: r.best, worst: r.worst });
    log(`${i + 1}. ${type.title} (${items.length}) — $${r.costUsd.toFixed(3)}`);
  }
  const stats: PlaybookStats = { objections: objections.length, calls, classified: cls.assignment.size, generatedAt: new Date().toISOString() };
  return { entries, stats, costUsd };
}

/** Gemmer bogen som ny aktiv version (den forrige deaktiveres). */
export async function publishPlaybook(entries: PlaybookEntry[], stats: PlaybookStats, costUsd: number) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.salesScriptVersion.findFirst({ where: { kind: PLAYBOOK_KIND }, orderBy: { version: "desc" }, select: { version: true } });
    await tx.salesScriptVersion.updateMany({ where: { kind: PLAYBOOK_KIND, isActive: true }, data: { isActive: false } });
    return tx.salesScriptVersion.create({
      data: {
        kind: PLAYBOOK_KIND,
        name: `Indvendingsbog ${new Date().toISOString().slice(0, 10)}`,
        version: (last?.version ?? 0) + 1,
        content: entries as never,
        evidence: stats as never,
        basedOnCalls: stats.calls,
        isActive: true,
        generatedBy: "api",
        promptVersion: PLAYBOOK_PROMPT_VERSION,
        costUsd,
        publishedAt: new Date(),
      },
      select: { id: true, version: true },
    });
  });
}
