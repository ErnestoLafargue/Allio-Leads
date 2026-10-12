/**
 * Importerer alle Telnyx-optagelser til `CallRecording` (Scripts & Træning) og udskriver
 * hvor mange der blev koblet til sælger, lead og udfald. Kan køres igen uden dubletter.
 *
 * Brug (.env.branch sidst, så DATABASE_URL peger på Neon-branchen — db-guard stopper ellers):
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/import-call-recordings.ts [--from 2026-09-01]
 *
 * Kræver at migrationen `call_recordings` er kørt på databasen i DATABASE_URL.
 */
import { prisma } from "@/lib/prisma";
import { importCallRecordings } from "@/lib/call-recording-import";
import { assertExpectedDatabase } from "@/lib/db-guard";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  assertExpectedDatabase();
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) throw new Error("TELNYX_API_KEY mangler.");
  const from = argValue("--from");
  const started = Date.now();
  const stats = await importCallRecordings({
    apiKey,
    fromIso: from ? new Date(from).toISOString() : null,
    log: (line) => console.log(line),
  });
  console.log(JSON.stringify(stats, null, 2));
  console.log(`Færdig på ${Math.round((Date.now() - started) / 1000)} s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
