/**
 * Henter ALLE Telnyx-optagelser for de seneste N «Møde booket»-leads.
 *
 *   set -a; . ./.env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/sync-meeting-booked-recordings.ts [--limit 15]
 */
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { syncRecentMeetingBookedRecordings } from "@/lib/telnyx-recordings-auto-sync";

function parseLimit(argv: string[]): number {
  const i = argv.indexOf("--limit");
  if (i >= 0) {
    const n = Number(argv[i + 1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 15;
}

async function recordingCount(leadId: string): Promise<number> {
  return prisma.leadActivityEvent.count({
    where: {
      leadId,
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      recordingUrl: { not: null },
      NOT: { recordingUrl: "" },
    },
  });
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  if (!process.env.TELNYX_API_KEY?.trim()) {
    console.error("TELNYX_API_KEY mangler i miljøet.");
    process.exit(1);
  }

  console.log(`=== Henter lydfiler for seneste ${limit} møde-booket leads ===`);
  const { leads } = await syncRecentMeetingBookedRecordings(limit);
  if (leads.length === 0) {
    console.log("Ingen MEETING_BOOKED-leads fundet.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const lead of leads) {
    const files = await recordingCount(lead.id);
    const mark = lead.ok ? "ok" : "FAIL";
    if (lead.ok) ok += 1;
    else failed += 1;
    console.log(
      `${mark}  ${lead.companyName}  booked=${lead.meetingBookedAt ?? "—"}  files=${files}` +
        (lead.message ? `  (${lead.message})` : ""),
    );
  }
  console.log(`\nFærdig: ${ok} ok, ${failed} fejlede, ${leads.length} leads.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
