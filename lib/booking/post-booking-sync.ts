import { prisma } from "@/lib/prisma";
import { calBookingNeedsRefresh } from "@/lib/calcom/fetch-booking";
import { ensureCalComBookingForLead } from "@/lib/calcom/sync-lead-booking";
import {
  advanceKundeStadie,
  ensureCustomerInPodio,
  KUNDE_STADIE,
  MOEDE_STATUS,
  readKundeStadie,
  updatePodioMeetingStatus,
} from "@/lib/podio/customer-mapping";

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
      calComMeetingUrl: true,
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
    const needsCal =
      !lead.calComBookingUid ||
      (await calBookingNeedsRefresh({
        calComBookingUid: lead.calComBookingUid,
        meetingScheduledFor: lead.meetingScheduledFor,
      }));

    if (needsCal) {
      await ensureCalComBookingForLead({
        leadId: lead.id,
        start: lead.meetingScheduledFor,
        attendeeName: lead.meetingContactName,
        attendeeEmail: lead.meetingContactEmail,
        attendeePhone: lead.meetingContactPhonePrivate || undefined,
        notes: lead.notes || undefined,
        replaceExisting: Boolean(lead.calComBookingUid),
      });
    }

    const refreshed = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        calComMeetingUrl: true,
        meetingScheduledFor: true,
      },
    });

    if (refreshed?.meetingScheduledFor) {
      await updatePodioMeetingStatus(leadId, {
        status: MOEDE_STATUS.booket,
        newStart: refreshed.meetingScheduledFor,
        meetingUrl: refreshed.calComMeetingUrl,
      });
    }

    await ensureCustomerInPodio(leadId);

    const stadie = await readKundeStadie(leadId);
    if (stadie === KUNDE_STADIE.tabt) {
      await advanceKundeStadie(leadId, KUNDE_STADIE.moedeBooket);
    }
  } catch (err) {
    console.error(
      "[post-booking-sync] fejlede (ikke-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}
