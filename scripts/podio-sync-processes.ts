/**
 * Manuel proces-sync for en kunde baseret på nuværende Stadie i Podio.
 *
 * Brug når Kunder-webhook har været nede, eller processer er ude af sync med stadie.
 *
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/podio-sync-processes.ts <leadId>
 *   npx tsx scripts/podio-sync-processes.ts <kundeItemId>
 *
 * Eller via wrapper:
 *   node scripts/podio-sync-processes.mjs <leadId>
 */

import { isPodioConfigured } from "@/lib/podio/client";
import { readKundeStadie, syncProcessesForStadie } from "@/lib/podio/customer-mapping";
import { resolveLeadIdFromInput } from "./podio-sync-processes-lib";

async function main(): Promise<void> {
  const input = (process.argv[2] ?? "").trim();
  if (!input) {
    console.error("Usage: npx tsx scripts/podio-sync-processes.ts <leadId|kundeItemId>");
    process.exit(1);
  }

  if (!isPodioConfigured()) {
    console.error("Podio ikke konfigureret — tjek PODIO_* i .env.local");
    process.exit(1);
  }

  const leadId = await resolveLeadIdFromInput(input);
  if (!leadId) {
    console.error(`Kunne ikke finde kunde/lead for "${input}"`);
    process.exit(1);
  }

  const stadie = await readKundeStadie(leadId);
  if (!stadie) {
    console.error(`Ingen Stadie fundet for lead ${leadId}`);
    process.exit(1);
  }

  console.log(`Synkroniserer processer for lead ${leadId} — stadie: ${stadie}`);
  await syncProcessesForStadie(leadId, stadie);
  console.log("Færdig.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
