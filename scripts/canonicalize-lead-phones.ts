/**
 * Kanoniserer `Lead.phone` og `meetingContactPhonePrivate` (samme logik som API/import).
 * Kør mod produktion med DATABASE_URL i .env / .env.local.
 *
 *   npx tsx scripts/canonicalize-lead-phones.ts
 *   npx tsx scripts/canonicalize-lead-phones.ts --dry-run
 */
import { config as loadEnv } from "dotenv";
import { prisma } from "@/lib/prisma";
import { canonicalLeadPhoneForStorage } from "@/lib/phone-e164";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

const BATCH = 500;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  let skip = 0;
  let examined = 0;
  let updated = 0;

  for (;;) {
    const rows = await prisma.lead.findMany({
      skip,
      take: BATCH,
      orderBy: { id: "asc" },
      select: { id: true, phone: true, meetingContactPhonePrivate: true },
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      examined += 1;
      const nextPhone = canonicalLeadPhoneForStorage(r.phone);
      let nextMeeting: string | null = r.meetingContactPhonePrivate;
      if (r.meetingContactPhonePrivate != null) {
        nextMeeting = canonicalLeadPhoneForStorage(r.meetingContactPhonePrivate);
      }

      const phoneChanged = nextPhone !== r.phone;
      const meetingChanged = nextMeeting !== r.meetingContactPhonePrivate;

      if (!phoneChanged && !meetingChanged) continue;

      if (dryRun) {
        updated += 1;
        continue;
      }

      await prisma.lead.update({
        where: { id: r.id },
        data: {
          ...(phoneChanged ? { phone: nextPhone } : {}),
          ...(meetingChanged ? { meetingContactPhonePrivate: nextMeeting } : {}),
        },
      });
      updated += 1;
    }

    skip += BATCH;
  }

  console.log(
    dryRun
      ? `[canonicalize-lead-phones] dry-run: ${examined} rækker, ${updated} ville blive opdateret.`
      : `[canonicalize-lead-phones] færdig: ${examined} rækker, ${updated} opdateret.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
