/**
 * Cal.eu reconcile — sikkerhedsnet for mistede webhooks.
 *
 * Webhooken (/api/webhooks/cal-com) er kilden til realtid. Dette script er en
 * idempotent catch-up: det finder leads, hvor Allio stadig tror mødet er aktivt
 * (status MEETING_BOOKED + udfald PENDING) og har et calComBookingUid, slår
 * bookingen op i Cal.eu, og sætter leadet til "Genbook" hvis bookingen er
 * aflyst eller markeret som udeblivelse.
 *
 * Sikkert i produktion: rører kun leads i MEETING_BOOKED+PENDING — leads der
 * allerede er flyttet videre (NEW/REBOOK/terminal) lades urørt, så et aflyst
 * møde ikke "genopstår" efter en agent har arbejdet videre med leadet.
 *
 * Brug:
 *   npx tsx scripts/calcom-reconcile.ts            # reconcilér (skriver)
 *   npx tsx scripts/calcom-reconcile.ts --dry-run  # vis kun, skriv ikke
 *   npx tsx scripts/calcom-reconcile.ts --report   # read-only: alle leads m. aflyst booking
 *   npx tsx scripts/calcom-reconcile.ts --rebook-uids=uid1,uid2  # engangsretning af konkrete bookinger
 *
 * --rebook-uids er til engangsoprydning (fx aflysninger mistet før webhooken var
 * deployet): det sætter de NAVNGIVNE bookingers leads til Genbook uanset status,
 * men kun hvis Cal bekræfter at bookingen faktisk er aflyst. Brug ALDRIG i cron
 * (kan "genoplive" leads en agent har arbejdet videre med).
 *
 * Kræver miljø: DATABASE_URL, CALCOM_HOST, CALCOM_API_KEY. Kør fx:
 *   set -a && source .env.local && set +a && npx tsx scripts/calcom-reconcile.ts
 */

import { prisma } from "@/lib/prisma";
import { applyCalRebook } from "@/lib/calcom/webhook-apply";

const CAL_API_VERSION = "2024-08-13";

function host(): string {
  return (process.env.CALCOM_HOST ?? "").trim() || "api.cal.com";
}
function apiKey(): string {
  return (process.env.CALCOM_API_KEY ?? "").trim();
}

type CalBookingStatus = "accepted" | "pending" | "cancelled" | "rejected" | "awaiting_host" | string;

type CalBooking = {
  uid: string;
  status: CalBookingStatus;
  cancellationReason?: string;
  start?: string;
  attendees?: { absent?: boolean }[];
};

/** Slår en booking op i Cal.eu. Returnerer null ved 404/fejl (booking findes ikke). */
async function fetchCalBooking(uid: string): Promise<CalBooking | null> {
  const url = `https://${host()}/v2/bookings/${encodeURIComponent(uid)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "cal-api-version": CAL_API_VERSION,
      },
    });
  } catch (err) {
    console.error(`[reconcile] netværksfejl for uid=${uid}:`, (err as Error).message);
    return null;
  }
  if (!res.ok) {
    if (res.status !== 404) {
      console.error(`[reconcile] Cal.eu ${res.status} for uid=${uid}`);
    }
    return null;
  }
  const json = (await res.json().catch(() => null)) as { data?: CalBooking } | null;
  return json?.data ?? null;
}

/** Afledt handling ud fra Cal-bookingens tilstand. */
function deriveAction(b: CalBooking): { kind: "cancelled" | "no_show" | "none"; reason?: string } {
  if (b.status === "cancelled" || b.status === "rejected") {
    return { kind: "cancelled", reason: b.cancellationReason };
  }
  const guestAbsent = (b.attendees ?? []).some((a) => a?.absent === true);
  if (guestAbsent) return { kind: "no_show" };
  return { kind: "none" };
}

async function reportMode(): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: { NOT: { calComBookingUid: null } },
    select: {
      id: true,
      companyName: true,
      status: true,
      meetingOutcomeStatus: true,
      calComBookingUid: true,
    },
  });
  console.log(`[reconcile] read-only rapport — ${leads.length} leads med calComBookingUid\n`);
  for (const lead of leads) {
    const uid = lead.calComBookingUid as string;
    const booking = await fetchCalBooking(uid);
    if (!booking) {
      console.log(`  ? ${lead.companyName} (${lead.id}) uid=${uid} → ingen Cal-booking`);
      continue;
    }
    const action = deriveAction(booking);
    if (action.kind !== "none") {
      console.log(
        `  ! ${lead.companyName} (${lead.id}) Allio=${lead.status}/${lead.meetingOutcomeStatus} ` +
          `Cal=${booking.status} → ville foreslå: ${action.kind}`,
      );
    }
  }
  console.log("\n[reconcile] rapport færdig (ingen ændringer foretaget).");
}

async function reconcile(dryRun: boolean): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: {
      status: "MEETING_BOOKED",
      meetingOutcomeStatus: "PENDING",
      NOT: { calComBookingUid: null },
    },
    select: { id: true, companyName: true, calComBookingUid: true },
  });

  console.log(
    `[reconcile] ${leads.length} aktive bookede leads at tjekke${dryRun ? " (DRY RUN)" : ""}\n`,
  );

  let rebooked = 0;
  let noShow = 0;
  let unchanged = 0;
  let missing = 0;

  for (const lead of leads) {
    const uid = lead.calComBookingUid as string;
    const booking = await fetchCalBooking(uid);
    if (!booking) {
      missing += 1;
      console.log(`  ? ${lead.companyName} (${lead.id}) uid=${uid} → ingen Cal-booking, springer over`);
      continue;
    }

    const action = deriveAction(booking);
    if (action.kind === "none") {
      unchanged += 1;
      continue;
    }

    if (dryRun) {
      console.log(`  → ${lead.companyName} (${lead.id}) Cal=${booking.status} → ville sætte: ${action.kind}`);
      if (action.kind === "cancelled") rebooked += 1;
      else noShow += 1;
      continue;
    }

    if (action.kind === "cancelled") {
      await applyCalRebook(lead.id, { source: "cancelled", reason: action.reason });
      rebooked += 1;
      console.log(`  ✓ ${lead.companyName} (${lead.id}) aflyst i Cal → sat til Genbook`);
    } else {
      await applyCalRebook(lead.id, { source: "no_show" });
      noShow += 1;
      console.log(`  ✓ ${lead.companyName} (${lead.id}) udeblivelse i Cal → sat til Genbook`);
    }
  }

  console.log(
    `\n[reconcile] færdig: ${rebooked} aflyst→Genbook, ${noShow} udeblivelse→Genbook, ` +
      `${unchanged} uændret, ${missing} uden Cal-booking.`,
  );
}

/** Engangsretning: sæt navngivne bookingers leads til Genbook (uanset status). */
async function rebookUids(uids: string[]): Promise<void> {
  console.log(`[reconcile] engangsretning af ${uids.length} booking-uid(s)\n`);
  let done = 0;
  for (const uid of uids) {
    const lead = await prisma.lead.findFirst({
      where: { calComBookingUid: uid },
      select: { id: true, companyName: true, status: true, meetingOutcomeStatus: true },
    });
    if (!lead) {
      console.log(`  ? uid=${uid} → intet matchende lead`);
      continue;
    }
    const booking = await fetchCalBooking(uid);
    if (!booking) {
      console.log(`  ? ${lead.companyName} (${lead.id}) uid=${uid} → ingen Cal-booking`);
      continue;
    }
    const action = deriveAction(booking);
    if (action.kind === "none") {
      console.log(
        `  - ${lead.companyName} (${lead.id}) Cal=${booking.status} → ikke aflyst, springer over`,
      );
      continue;
    }
    if (lead.status === "MEETING_BOOKED" && lead.meetingOutcomeStatus === "REBOOK") {
      console.log(`  = ${lead.companyName} (${lead.id}) allerede Genbook, springer over`);
      continue;
    }
    await applyCalRebook(lead.id, {
      source: action.kind === "no_show" ? "no_show" : "cancelled",
      reason: action.reason,
    });
    done += 1;
    console.log(`  ✓ ${lead.companyName} (${lead.id}) ${booking.status} → sat til Genbook`);
  }
  console.log(`\n[reconcile] engangsretning færdig: ${done} sat til Genbook.`);
}

async function main(): Promise<void> {
  if (!apiKey()) {
    console.error("[reconcile] CALCOM_API_KEY mangler — afbryder.");
    process.exitCode = 1;
    return;
  }
  const args = process.argv.slice(2);
  const rebookArg = args.find((a) => a.startsWith("--rebook-uids="));
  try {
    if (rebookArg) {
      const uids = rebookArg
        .slice("--rebook-uids=".length)
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean);
      await rebookUids(uids);
    } else if (args.includes("--report")) {
      await reportMode();
    } else {
      await reconcile(args.includes("--dry-run"));
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
