import { prisma } from "@/lib/prisma";
import { createCalComBooking, isCalComConfigured } from "@/lib/calcom/client";
import { calBookingNeedsRefresh } from "@/lib/calcom/fetch-booking";

export type EnsureCalComBookingInput = {
  leadId: string;
  start: Date;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  notes?: string;
  /** Opret ny booking selv om leadet allerede har calComBookingUid (genbook). */
  replaceExisting?: boolean;
};

/**
 * Opretter Cal.eu-booking for et lead hvis det endnu ikke har calComBookingUid,
 * eller når replaceExisting er sat (genbook / ny mødetid).
 * Ikke-fatal: returnerer null ved fejl (intern Allio-booking bevares).
 */
export async function ensureCalComBookingForLead(
  input: EnsureCalComBookingInput,
): Promise<{ uid: string; meetingUrl: string | null } | null> {
  if (!isCalComConfigured()) return null;

  const existing = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { calComBookingUid: true, meetingScheduledFor: true },
  });
  if (!existing) return null;

  if (existing.calComBookingUid && !input.replaceExisting) {
    const needsRefresh = await calBookingNeedsRefresh({
      calComBookingUid: existing.calComBookingUid,
      meetingScheduledFor: existing.meetingScheduledFor,
    });
    if (!needsRefresh) return null;
  }

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
      `[calcom] booking ${input.replaceExisting || existing.calComBookingUid ? "opdateret" : "oprettet"} for lead ${input.leadId}: uid=${booking.uid}`,
    );
    return booking;
  } catch (err) {
    console.error(
      `[calcom] ensureCalComBookingForLead FEJLEDE for lead ${input.leadId} (uid mangler — aflysninger kan ikke matche):`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
