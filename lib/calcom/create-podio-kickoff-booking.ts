import { prisma } from "@/lib/prisma";
import {
  createCalComBooking,
  isCalComKickoffConfigured,
  kickoffEventTypeId,
} from "@/lib/calcom/client";

/**
 * Opretter Cal.eu-booking til kick-off (separat fra onboarding-booking på leadet).
 * Gemmer ikke uid på Allio-lead — kun til brug på Podio kick-off-møde.
 */
export async function createPodioKickoffBooking(input: {
  leadId: string;
  start: Date;
  notes?: string;
}): Promise<{ uid: string; meetingUrl: string | null } | null> {
  if (!isCalComKickoffConfigured()) return null;

  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: {
      meetingContactName: true,
      meetingContactEmail: true,
      meetingContactPhonePrivate: true,
      meetingCompanyName: true,
      companyName: true,
    },
  });
  if (!lead?.meetingContactName || !lead.meetingContactEmail) return null;

  const notes =
    input.notes ??
    `Kick-off — ${lead.meetingCompanyName || lead.companyName || "kunde"}`;

  try {
    const booking = await createCalComBooking({
      start: input.start,
      attendeeName: lead.meetingContactName,
      attendeeEmail: lead.meetingContactEmail,
      attendeePhone: lead.meetingContactPhonePrivate || undefined,
      notes,
      eventTypeId: kickoffEventTypeId(),
    });
    console.log(
      `[calcom] kick-off booking for lead ${input.leadId}: uid=${booking.uid}`,
    );
    return booking;
  } catch (err) {
    console.error(
      `[calcom] createPodioKickoffBooking fejlede for lead ${input.leadId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
