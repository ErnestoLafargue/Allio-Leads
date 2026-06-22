import { prisma } from "@/lib/prisma";
import { createCalComBooking, isCalComConfigured } from "@/lib/calcom/client";

export type EnsureCalComBookingInput = {
  leadId: string;
  start: Date;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  notes?: string;
};

/**
 * Opretter Cal.eu-booking for et lead hvis det endnu ikke har calComBookingUid.
 * Ikke-fatal: returnerer null ved fejl (intern Allio-booking bevares).
 */
export async function ensureCalComBookingForLead(
  input: EnsureCalComBookingInput,
): Promise<{ uid: string; meetingUrl: string | null } | null> {
  if (!isCalComConfigured()) return null;

  const existing = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { calComBookingUid: true },
  });
  if (existing?.calComBookingUid) return null;

  try {
    const booking = await createCalComBooking({
      start: input.start,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      attendeePhone: input.attendeePhone,
      notes: input.notes,
    });
    await prisma.lead.update({
      where: { id: input.leadId },
      data: {
        calComBookingUid: booking.uid,
        calComMeetingUrl: booking.meetingUrl,
      },
    });
    console.log(
      `[calcom] booking oprettet for lead ${input.leadId}: uid=${booking.uid}`,
    );
    return booking;
  } catch (err) {
    // Ikke-fatal: intern Allio-booking bevares. Men uden uid kan en senere
    // Cal.eu-aflysning ikke matches — derfor logges det tydeligt, og
    // scripts/calcom-reconcile.ts --repair-uids er sikkerhedsnettet.
    console.error(
      `[calcom] ensureCalComBookingForLead FEJLEDE for lead ${input.leadId} (uid mangler — aflysninger kan ikke matche):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
