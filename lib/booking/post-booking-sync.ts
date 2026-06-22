import { prisma } from "@/lib/prisma";
import { ensureCalComBookingForLead } from "@/lib/calcom/sync-lead-booking";
import { ensureCustomerInPodio } from "@/lib/podio/customer-mapping";

/**
 * Cal.eu + Podio efter mødebooking (køres i after() — blokerer ikke HTTP-svar).
 */
export async function syncPostBookingIntegrations(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      status: true,
      calComBookingUid: true,
      meetingScheduledFor: true,
      meetingContactName: true,
      meetingContactEmail: true,
      meetingContactPhonePrivate: true,
      notes: true,
    },
  });
  if (!lead || lead.status !== "MEETING_BOOKED") return;
  if (!lead.meetingScheduledFor || !lead.meetingContactName || !lead.meetingContactEmail) return;

  try {
    if (!lead.calComBookingUid) {
      await ensureCalComBookingForLead({
        leadId: lead.id,
        start: lead.meetingScheduledFor,
        attendeeName: lead.meetingContactName,
        attendeeEmail: lead.meetingContactEmail,
        attendeePhone: lead.meetingContactPhonePrivate || undefined,
        notes: lead.notes || undefined,
      });
    }
    await ensureCustomerInPodio(leadId);
  } catch (err) {
    console.error(
      "[post-booking-sync] fejlede (ikke-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}
