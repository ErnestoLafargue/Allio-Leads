/**
 * Engangs-backfill: sæt «Sælger» i Podios Møder-app på kommende møder til den sælger, mødet er
 * tildelt i Allio (Allio → Podio). Møder hvor Podio allerede er rigtigt springes over.
 *
 * Standard er prøvetilstand — læser kun og viser, hvad der ville blive sat. --apply skriver til Podio.
 * Læser DATABASE_URL og Podio-nøgler fra .env / .env.local (kør med produktionens env efter deploy).
 *
 *   npx tsx scripts/podio-saelger-backfill.ts
 *   npx tsx scripts/podio-saelger-backfill.ts --apply
 */
import { config as loadEnv } from "dotenv";
import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtc } from "@/lib/copenhagen-day";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import {
  getItem,
  isPodioAppConfigured,
  readAppRelationItemIds,
  setPodioAppReference,
  updateItemValues,
  type PodioFieldValues,
} from "@/lib/podio/client";
import { MOEDE_FIELDS, resolveMoedeItemId } from "@/lib/podio/meeting-sync";
import { resolvePodioSellerItemId } from "@/lib/podio/sellers";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(ukendt)";
  } catch {
    return "(ukendt)";
  }
}

function formatTime(d: Date | null): string {
  return d
    ? d.toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" })
    : "—";
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Database: ${dbHost()}`);
  console.log(apply ? "Tilstand: SKRIVER til Podio (--apply)\n" : "Tilstand: prøve — intet skrives\n");
  if (!isPodioAppConfigured("moeder")) {
    console.error("Podio Møder-app er ikke sat op (PODIO_* mangler).");
    process.exit(1);
  }

  const { start } = copenhagenDayBoundsUtc();
  const leads = await prisma.lead.findMany({
    where: {
      status: "MEETING_BOOKED",
      meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
      meetingScheduledFor: { gte: start },
    },
    orderBy: { meetingScheduledFor: "asc" },
    select: {
      id: true,
      companyName: true,
      meetingCompanyName: true,
      meetingScheduledFor: true,
      podioItemId: true,
      assignedUser: { select: { name: true, podioSellerItemId: true } },
    },
  });

  const counts = { sat: 0, alleredeRigtig: 0, ingenSaelger: 0, ingenPodioSaelger: 0, ingenPodioMoede: 0, fejl: 0 };

  for (const lead of leads) {
    const company = lead.meetingCompanyName.trim() || lead.companyName.trim() || lead.id;
    const label = `${formatTime(lead.meetingScheduledFor)}  ${company}`;
    try {
      if (!lead.assignedUser) {
        counts.ingenSaelger++;
        console.log(`– ${label}: ingen sælger i Allio («Ingen tildelt») — springes over`);
        continue;
      }
      const sellerItemId = await resolvePodioSellerItemId(lead.assignedUser);
      if (!sellerItemId) {
        counts.ingenPodioSaelger++;
        console.log(`! ${label}: ${lead.assignedUser.name} har intet Podio-sælgerelement — springes over`);
        continue;
      }
      const moedeItemId = await resolveMoedeItemId(lead.id, lead.podioItemId);
      if (!moedeItemId) {
        counts.ingenPodioMoede++;
        console.log(`! ${label}: findes ikke i Podio — springes over`);
        continue;
      }
      const item = await getItem("moeder", moedeItemId);
      const current = item ? readAppRelationItemIds(item, MOEDE_FIELDS.saelger) : [];
      if (current.length === 1 && current[0] === sellerItemId) {
        counts.alleredeRigtig++;
        console.log(`✓ ${label}: allerede ${lead.assignedUser.name}`);
        continue;
      }

      const before = current.length ? current.map((id) => `#${id}`).join(", ") : "tom";
      console.log(
        `→ ${label}: Sælger ${before} → ${lead.assignedUser.name} (#${sellerItemId})  [Podio-møde #${moedeItemId}]`,
      );
      if (apply) {
        const fields: PodioFieldValues = {};
        await setPodioAppReference("moeder", fields, MOEDE_FIELDS.saelger, [sellerItemId]);
        await updateItemValues("moeder", moedeItemId, fields);
      }
      counts.sat++;
    } catch (err) {
      counts.fejl++;
      console.error(`✗ ${label}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(
    `\n${leads.length} kommende møder. ${apply ? "Sat" : "Ville blive sat"}: ${counts.sat}. ` +
      `Allerede rigtige: ${counts.alleredeRigtig}. Uden sælger: ${counts.ingenSaelger}. ` +
      `Sælger uden Podio-element: ${counts.ingenPodioSaelger}. Ikke i Podio: ${counts.ingenPodioMoede}. ` +
      `Fejl: ${counts.fejl}.`,
  );
  if (!apply && counts.sat > 0) console.log("Kør igen med --apply for at skrive til Podio.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
