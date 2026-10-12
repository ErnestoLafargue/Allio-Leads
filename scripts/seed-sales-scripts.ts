/**
 * Indlæser de historiske pitches fra docs/salgsscripts som SalesScriptVersion (kind SEED).
 * Idempotent: pitches, der allerede findes (samme navn), springes over.
 *
 * Brug:  set -a; . ./.env.local; . ./.env.branch; set +a
 *        npx tsx --tsconfig tsconfig.json scripts/seed-sales-scripts.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";

const SEEDS = [
  { file: "pitch-5.md", name: "Pitch 5" },
  { file: "pitch-6.md", name: "Pitch 6" },
  { file: "pitch-7.md", name: "Pitch 7" },
  { file: "onlinebooq-booking-free.md", name: "Onlinebooq → Allio Booking Free" },
  { file: "pitch-nynyny.md", name: "Pitch NyNyNy" },
];

async function main() {
  assertExpectedDatabase();
  let version = (await prisma.salesScriptVersion.findFirst({ where: { kind: "SEED" }, orderBy: { version: "desc" } }))?.version ?? 0;
  for (const s of SEEDS) {
    if (await prisma.salesScriptVersion.findFirst({ where: { kind: "SEED", name: s.name } })) continue;
    const text = await readFile(path.join(process.cwd(), "docs/salgsscripts", s.file), "utf8");
    version += 1;
    await prisma.salesScriptVersion.create({
      data: { kind: "SEED", name: s.name, version, content: { format: "text", text }, generatedBy: "seed" },
    });
    console.log(`Indlæst ${s.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
