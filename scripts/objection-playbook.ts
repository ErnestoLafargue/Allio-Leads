/**
 * Bygger indvendingsbogen (de 30 hyppigste indvendinger med analyse, bedste/dårligste behandling og
 * skabelon) og udgiver den som aktiv version. Kræver BRANCH_GUARD (.env.branch, eller .env.worker for
 * produktion). Kør: npx tsx scripts/objection-playbook.ts [--dry]
 */
import { createAnthropicClient } from "@/lib/anthropic-client";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { buildPlaybook, publishPlaybook } from "@/lib/objection-playbook/generate";
import { prisma } from "@/lib/prisma";

async function main() {
  assertExpectedDatabase();
  const dry = process.argv.includes("--dry");
  const { entries, stats, costUsd } = await buildPlaybook(createAnthropicClient(), (m) => console.log(m));
  console.log(`I alt $${costUsd.toFixed(3)}`);
  if (dry) {
    console.log(JSON.stringify(entries.slice(0, 3), null, 2));
  } else {
    const saved = await publishPlaybook(entries, stats, costUsd);
    console.log(`Udgivet som version ${saved.version}`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
