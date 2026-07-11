import { prisma } from "@/lib/prisma";
import { calBookingNeedsRefresh } from "@/lib/calcom/fetch-booking";
import { ensureCalComBookingForLead } from "@/lib/calcom/sync-lead-booking";
import { ensureMoedeInPodio, MOEDE_STATUS, updateMoedeInPodio } from "@/lib/podio/meeting-sync";
import { acquirePodioSyncLock, releasePodioSyncLock } from "@/lib/podio/sync-lock";

function syncLog(leadId: string, step: string, startedMs: number): void {
  console.log(`[podio-sync] lead=${leadId} step=${step} ms=${Date.now() - startedMs}`);
}

/**
 * Cal.eu + Podio efter mødebooking (køres i after() — blokerer ikke HTTP-svar).
 * Podio først (hurtig synlighed), Cal.eu bagefter.
 */
export async function syncPostBookingIntegrations(leadId: string): Promise<void> {
  const t0 = Date.now();

  if (!(await acquirePodioSyncLock(leadId))) {
    console.log(`[podio-sync] lead=${leadId} step=skipped reason=lock_held`);
    return;
  }

  try {
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
      },
    });
    if (!lead || lead.status !== "MEETING_BOOKED") return;
    if (!lead.meetingScheduledFor || !lead.meetingContactName || !lead.meetingContactEmail) return;

    await ensureMoedeInPodio(leadId);
    syncLog(leadId, "podio_moede", t0);

    const afterPodio = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        calComMeetingUrl: true,
        meetingScheduledFor: true,
      },
    });

    if (afterPodio?.meetingScheduledFor) {
      await updateMoedeInPodio(leadId, {
        status: MOEDE_STATUS.afventer,
        newStart: afterPodio.meetingScheduledFor,
        meetingUrl: afterPodio.calComMeetingUrl,
      });
      syncLog(leadId, "podio_moede_status", t0);
    }

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
        replaceExisting: Boolean(lead.calComBookingUid),
      });
      syncLog(leadId, "cal_booking", t0);

      const refreshed = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          calComMeetingUrl: true,
          meetingScheduledFor: true,
        },
      });

      if (refreshed?.meetingScheduledFor) {
        await updateMoedeInPodio(leadId, {
          status: MOEDE_STATUS.afventer,
          newStart: refreshed.meetingScheduledFor,
          meetingUrl: refreshed.calComMeetingUrl,
        });
        syncLog(leadId, "podio_moede_link_efter_cal", t0);
      }
    }

    syncLog(leadId, "done", t0);
  } catch (err) {
    console.error(
      "[post-booking-sync] fejlede (ikke-fatal):",
      err instanceof Error ? err.message : err,
    );
  } finally {
    await releasePodioSyncLock(leadId);
  }
}
