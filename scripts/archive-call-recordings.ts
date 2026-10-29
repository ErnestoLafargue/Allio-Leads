/**
 * Lydarkiv: kopierer alle Telnyx-optagelser på mindst 20 sekunder til Vercel Blob og
 * registrerer dem i `CallRecording` (se lib/call-recording-archive.ts). Cron gør det samme
 * hvert 10. minut; scriptet bruges til at indhente et efterslæb med det samme.
 * Kan køres igen uden dubletter.
 *
 * Brug (kræver TELNYX_API_KEY og BLOB_READ_WRITE_TOKEN; db-guard tjekker DATABASE_URL):
 *   npx tsx --tsconfig tsconfig.json scripts/archive-call-recordings.ts [--days 30]
 */
import { prisma } from "@/lib/prisma";
import { archiveTelnyxRecordings } from "@/lib/call-recording-archive";
import { assertExpectedDatabase } from "@/lib/db-guard";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  assertExpectedDatabase();
  const apiKey = process.env.TELNYX_API_KEY?.trim().replace(/^"|"$/g, "");
  if (!apiKey) throw new Error("TELNYX_API_KEY mangler.");
  const days = Number(argValue("--days") ?? "30");
  const started = Date.now();
  const stats = await archiveTelnyxRecordings({
    apiKey,
    lookbackDays: Number.isFinite(days) && days > 0 ? days : 30,
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
