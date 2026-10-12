/**
 * Importerer analyser skrevet i en Claude-session (<dir>/out/<id>.json): validerer mod skemaet og
 * transskriptionen, beregner scorer og gemmer som CallAnalysis (kilde "session").
 * Filer, der ikke kan valideres, listes, så samtalerne kan analyseres igen.
 *
 * Brug:
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/import-analyses.ts --dir /root/allio-analysis/b01 --model session-opus [--version v1]
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { saveCallAnalysis } from "@/lib/call-analysis/store";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  assertExpectedDatabase();
  const dir = arg("--dir");
  const model = arg("--model") ?? "session";
  const analysisVersion = arg("--version") ?? undefined;
  if (!dir) throw new Error("--dir mangler");
  const outDir = path.join(dir, "out");
  const files = (await readdir(outDir)).filter((f) => f.endsWith(".json"));
  const failed: string[] = [];
  let saved = 0;
  let warnings = 0;
  for (const f of files) {
    const id = f.replace(/\.json$/, "");
    try {
      const text = (await readFile(path.join(outDir, f), "utf8")).replace(/^```(json)?\s*|\s*```\s*$/g, "");
      const r = await saveCallAnalysis({ callRecordingId: id, raw: JSON.parse(text), source: "session", model, analysisVersion });
      saved += 1;
      warnings += r.warnings.length;
      console.log(`${id} score=${r.overall ?? "–"} advarsler=${r.warnings.length}`);
    } catch (err) {
      failed.push(id);
      console.log(`FEJL ${id}: ${(err instanceof Error ? err.message : String(err)).slice(0, 300)}`);
    }
  }
  console.log(`Gemt ${saved}/${files.length} · advarsler i alt ${warnings} · fejl: ${failed.join(",") || "ingen"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
