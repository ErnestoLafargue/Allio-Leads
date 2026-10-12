/**
 * Eksporterer transskriberede samtaler til analyse i en Claude-session (historikken, uden API).
 * Skriver prompt.md (samme systemprompt + JSON-skema som workeren bruger) og én inputfil pr. samtale.
 * Sub-agenter skriver ét JSON-svar pr. samtale i <dir>/out/<id>.json → scripts/import-analyses.ts.
 *
 * Brug:
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/export-analysis-batch.ts --dir /root/allio-analysis/b01 \
 *     [--gold 30] [--limit 60] [--ids id1,id2] [--exclude /sti/manifest.json,…]
 *
 * Rækkefølge: (a) samtaler med udfald og ≥ 60 s, (b) øvrige ≥ 60 s, (c) resten.
 * Kundedata bliver på VPS'en (filerne ligger lokalt og slettes efter import).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { ANALYSIS_SYSTEM_PROMPT, ANALYSIS_VERSION, COMPATIBLE_ANALYSIS_VERSIONS } from "@/lib/call-analysis/prompt";
import { analysisJsonSchema } from "@/lib/call-analysis/schema";
import { loadAnalysisInput } from "@/lib/call-analysis/store";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

type Candidate = { id: string; durationSeconds: number; outcomeStatus: string | null; agentUserId: string | null };

const priority = (c: Candidate) => (c.durationSeconds >= 60 && c.outcomeStatus ? 0 : c.durationSeconds >= 60 ? 1 : 2);

/** Guldsæt: spredt på udfald og sælgere (1,5–15 min); mangler en kategori, fyldes op med de øvrige. */
function pickGold(candidates: Candidate[], n: number): Candidate[] {
  const quota: [string, (c: Candidate) => boolean, number][] = [
    ["møde", (c) => c.outcomeStatus === "MEETING_BOOKED", Math.round(n * 0.33)],
    ["nej", (c) => c.outcomeStatus === "NOT_INTERESTED" || c.outcomeStatus === "UNQUALIFIED", Math.round(n * 0.27)],
    ["callback", (c) => c.outcomeStatus === "CALLBACK_SCHEDULED", Math.round(n * 0.2)],
    ["uden udfald", (c) => c.outcomeStatus === null, n],
  ];
  quota.push(["resten", () => true, n]);
  const chosen: Candidate[] = [];
  for (const [, match, max] of quota) {
    const pool = candidates.filter((c) => match(c) && c.durationSeconds >= 90 && c.durationSeconds <= 900 && !chosen.includes(c));
    const perAgent = new Map<string, number>();
    pool.sort((a, b) => a.id.localeCompare(b.id));
    for (const c of pool) {
      if (chosen.length >= n || chosen.filter((x) => match(x)).length >= max) break;
      const k = c.agentUserId ?? "?";
      if ((perAgent.get(k) ?? 0) >= 3) continue;
      perAgent.set(k, (perAgent.get(k) ?? 0) + 1);
      chosen.push(c);
    }
  }
  return chosen.slice(0, n);
}

async function main() {
  assertExpectedDatabase();
  const dir = arg("--dir");
  if (!dir) throw new Error("--dir mangler");
  const ids = arg("--ids")?.split(",").filter(Boolean);
  const gold = arg("--gold");
  const limit = Number(arg("--limit") ?? 50);
  // Samtaler, der allerede er sendt til analyse i en anden batch (manifest-filer).
  const excluded = new Set<string>();
  for (const f of arg("--exclude")?.split(",").filter(Boolean) ?? []) {
    for (const id of JSON.parse(await readFile(f, "utf8")) as string[]) excluded.add(id);
  }

  const analyzed = new Set(
    (
      await prisma.callAnalysis.findMany({
        where: { analysisVersion: { in: COMPATIBLE_ANALYSIS_VERSIONS }, source: "session" },
        select: { callRecordingId: true },
      })
    ).map((a) => a.callRecordingId),
  );
  const candidates = (
    await prisma.callRecording.findMany({
      where: ids ? { id: { in: ids } } : { pipelineStatus: "TRANSCRIBED" },
      select: { id: true, durationSeconds: true, outcomeStatus: true, agentUserId: true },
    })
  ).filter((c) => ids || (!analyzed.has(c.id) && !excluded.has(c.id)));

  const selected = ids
    ? candidates
    : gold
      ? pickGold(candidates, Number(gold))
      : candidates.sort((a, b) => priority(a) - priority(b) || b.durationSeconds - a.durationSeconds).slice(0, limit);

  await mkdir(path.join(dir, "calls"), { recursive: true });
  await mkdir(path.join(dir, "out"), { recursive: true });
  const schema = JSON.stringify(analysisJsonSchema(), null, 1);
  await writeFile(
    path.join(dir, "prompt.md"),
    [
      `# Analyse af salgssamtaler — ${ANALYSIS_VERSION}`,
      "",
      "Du får en liste af inputfiler (calls/<id>.txt). For hver fil: analysér samtalen efter systemprompten",
      "nedenfor og skriv ét JSON-objekt, der følger skemaet, til out/<id>.json (kun JSON, ingen markdown).",
      "Skriv hver fil for sig, og læs ikke andre filer end prompten og dine tildelte samtaler.",
      "",
      "## Systemprompt",
      "",
      ANALYSIS_SYSTEM_PROMPT,
      "",
      "## JSON-skema",
      "",
      "```json",
      schema,
      "```",
      "",
    ].join("\n"),
  );
  for (const c of selected) {
    const { userMessage } = await loadAnalysisInput(c.id);
    await writeFile(path.join(dir, "calls", `${c.id}.txt`), userMessage);
  }
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(selected.map((c) => c.id), null, 1));
  const byPriority = selected.reduce<Record<string, number>>((acc, c) => {
    acc[`p${priority(c)}`] = (acc[`p${priority(c)}`] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Eksporteret ${selected.length} samtaler til ${dir} ${JSON.stringify(byPriority)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
