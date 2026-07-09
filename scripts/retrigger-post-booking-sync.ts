/**
 * Gentrig Podio + Cal.eu sync for et booket lead.
 *
 * Brug (med production env fra Vercel):
 *   npx vercel env run -e production -- tsx scripts/retrigger-post-booking-sync.ts <leadId>
 */
import { prisma } from "@/lib/prisma";
import { syncPostBookingIntegrations } from "@/lib/booking/post-booking-sync";
import { isCalComConfigured } from "@/lib/calcom/client";
import { isPodioConfigured } from "@/lib/podio/client";

const leadId = process.argv[2]?.trim();
if (!leadId) {
  console.error("Usage: tsx scripts/retrigger-post-booking-sync.ts <leadId>");
  process.exit(1);
}

async function main() {
  console.log("Podio configured:", isPodioConfigured());
  console.log("Cal.eu configured:", isCalComConfigured());

  const before = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      companyName: true,
      status: true,
      meetingContactName: true,
      meetingContactEmail: true,
      meetingScheduledFor: true,
      podioItemId: true,
      calComBookingUid: true,
      calComMeetingUrl: true,
    },
  });

  if (!before) {
    console.error(`Lead ${leadId} findes ikke.`);
    process.exit(1);
  }

  console.log("Før sync:", JSON.stringify(before, null, 2));

  if (before.status !== "MEETING_BOOKED") {
    console.error(`Lead har status ${before.status} — forventede MEETING_BOOKED.`);
    process.exit(1);
  }

  await syncPostBookingIntegrations(leadId);

  const after = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      podioItemId: true,
      calComBookingUid: true,
      calComMeetingUrl: true,
    },
  });

  console.log("Efter sync:", JSON.stringify(after, null, 2));

  if (!after?.podioItemId) {
    console.error("✖ podioItemId mangler stadig — tjek Podio credentials og logs.");
    process.exit(1);
  }
  if (!after?.calComBookingUid) {
    console.error("✖ calComBookingUid mangler stadig — tjek Cal.eu credentials og logs.");
    process.exit(1);
  }

  console.log("✓ Sync fuldført — Podio item", after.podioItemId, "Cal uid", after.calComBookingUid);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
