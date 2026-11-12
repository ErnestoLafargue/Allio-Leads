/**
 * Opret de Allio-Native bookinger, der mangler for kommende møder.
 *
 * Fra 12. okt. 2026 afviste Allio alle nye bookinger fra Allio-Leads (duration_minutes og notify_customer var ikke
 * tilladte felter). Scriptet finder leads med status MEETING_BOOKED, et kommende møde og ingen allioBookingId, og
 * kører den normale Allio-Native-sync for dem. Kun Allio-Native — Podio og Cal.eu røres ikke.
 *
 * Usage (fra repo-rod, med .env.local):
 *   npx tsx scripts/backfill-allio-native-bookings.ts           # vis hvilke møder der mangler
 *   npx tsx scripts/backfill-allio-native-bookings.ts --apply   # opret dem i Allio
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { isAllioNativeConfigured } from "../lib/allio-native/client";
import { ensureAllioNativeBookingForLead } from "../lib/allio-native/sync-lead-booking";

async function main() {
  const apply = process.argv.includes("--apply");
  if (!isAllioNativeConfigured()) throw new Error("Allio-Native er ikke konfigureret (ALLIO_API_KEY m.fl.)");

  const leads = await prisma.lead.findMany({
    where: {
      status: "MEETING_BOOKED",
      allioBookingId: null,
      meetingScheduledFor: { gt: new Date() },
    },
    select: { id: true, companyName: true, meetingScheduledFor: true, meetingType: true },
    orderBy: { meetingScheduledFor: "asc" },
  });

  console.log(`${leads.length} kommende møde(r) uden Allio-booking${apply ? "" : " (kør med --apply for at oprette)"}`);
  let created = 0;
  for (const lead of leads) {
    const when = lead.meetingScheduledFor?.toISOString() ?? "";
    if (!apply) {
      console.log(`- ${when} ${lead.meetingType} ${lead.companyName} (${lead.id})`);
      continue;
    }
    try {
      const result = await ensureAllioNativeBookingForLead(lead.id);
      if (result.skipped) {
        console.log(`  sprunget over: ${lead.companyName} (${lead.id})`);
      } else {
        created += 1;
        console.log(`  oprettet: ${when} ${lead.companyName} -> ${result.bookingId}`);
      }
    } catch (err) {
      console.error(`  fejl: ${lead.companyName} (${lead.id}):`, err instanceof Error ? err.message : err);
    }
  }
  if (apply) console.log(`Oprettet ${created} af ${leads.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
