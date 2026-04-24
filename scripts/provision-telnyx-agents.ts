/**
 * Kør samme Telnyx-provisionering som «Provisionér alle manglende» i UI.
 *
 * Kræver .env / .env.local med DATABASE_URL og TELNYX_API_KEY (som produktion).
 *
 * Brug:
 *   npx tsx scripts/provision-telnyx-agents.ts
 *   npx tsx scripts/provision-telnyx-agents.ts --userIds=id1,id2
 *   npx tsx scripts/provision-telnyx-agents.ts --force
 */
import { config as loadEnv } from "dotenv";
import { prisma } from "@/lib/prisma";
import { provisionTelnyxAgentsForUsers } from "@/lib/telnyx-provision-agents-server";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

function parseArgs() {
  const argv = process.argv.slice(2);
  let force = false;
  let userIds: string[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") force = true;
    else if (a === "--userIds" && argv[i + 1]) {
      userIds = argv[i + 1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i++;
    }
  }
  return { force, userIds };
}

async function main(): Promise<number> {
  const { force, userIds } = parseArgs();
  const out = await provisionTelnyxAgentsForUsers({ userIds, force });
  if (!out.ok) {
    console.error(`[${out.code}] ${out.error}`);
    return 1;
  }
  console.log("Opsummering:", out.summary);
  for (const r of out.results) {
    const line =
      r.status === "ok"
        ? `OK   ${r.username} (${r.name}) → sip:${r.sipUsername}`
        : r.status === "skipped"
          ? `SKIP ${r.username} (${r.name}) — allerede provisioneret`
          : `FAIL ${r.username} (${r.name}) — ${r.error ?? "?"}`;
    console.log(line);
  }
  return out.summary.failed > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
