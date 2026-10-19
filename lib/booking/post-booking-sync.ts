import { prisma } from "@/lib/prisma";
import { ensureAllioNativeBookingForLead } from "@/lib/allio-native/sync-lead-booking";
import { isAllioNativeConfigured } from "@/lib/allio-native/client";
import { calBookingNeedsRefresh } from "@/lib/calcom/fetch-booking";
import { ensureCalComBookingForLead } from "@/lib/calcom/sync-lead-booking";
import {
  MEETING_TYPE_PHYSICAL,
  normalizeMeetingType,
} from "@/lib/meeting-type";
import { ensureMoedeInPodio, updateMoedeInPodio } from "@/lib/podio/meeting-sync";
import { acquirePodioSyncLock, releasePodioSyncLock } from "@/lib/podio/sync-lock";

function syncLog(leadId: string, step: string, startedMs: number): void {
  console.log(`[post-booking-sync] lead=${leadId} step=${step} ms=${Date.now() - startedMs}`);
}

/**
 * Efter mødebooking (køres i after() — blokerer ikke HTTP-svar):
 *
 * Online:  Podio → Cal.eu (invitation + Meet) → Allio-Native (kunde + Onlinemøde)
 * Fysisk:  Podio → Allio-Native (kunde + Fysisk møde) — uden Cal.eu
 */
export async function syncPostBookingIntegrations(leadId: string): Promise<void> {
  const t0 = Date.now();

  if (!(await acquirePodioSyncLock(leadId))) {
    console.log(`[post-booking-sync] lead=${leadId} step=skipped reason=lock_held`);
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
        meetingType: true,
        meetingAddress: true,
        allioBookingId: true,
      },
    });
    if (!lead || lead.status !== "MEETING_BOOKED") return;
    if (!lead.meetingScheduledFor || !lead.meetingContactName || !lead.meetingContactEmail) return;

    const isPhysical = normalizeMeetingType(lead.meetingType) === MEETING_TYPE_PHYSICAL;

    await ensureMoedeInPodio(leadId);
    syncLog(leadId, "podio_moede", t0);

    const afterPodio = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        calComMeetingUrl: true,
        meetingScheduledFor: true,
        meetingAddress: true,
      },
    });

    if (afterPodio?.meetingScheduledFor) {
      await updateMoedeInPodio(leadId, {
        newStart: afterPodio.meetingScheduledFor,
        // Fysisk: brug mødeadresse som lokation i Podio indtil/uden Cal-link.
        meetingUrl: afterPodio.calComMeetingUrl || (isPhysical ? afterPodio.meetingAddress || null : null),
      });
      syncLog(leadId, "podio_moede_fields", t0);
    }

    // Cal.eu kun for onlinemøder (invitation + video-link).
    if (!isPhysical) {
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
          meetingType: lead.meetingType,
          meetingAddress: lead.meetingAddress,
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
            newStart: refreshed.meetingScheduledFor,
            meetingUrl: refreshed.calComMeetingUrl,
          });
          syncLog(leadId, "podio_moede_link_efter_cal", t0);
        }
      }
    } else {
      syncLog(leadId, "cal_skipped_physical", t0);
    }

    if (isAllioNativeConfigured()) {
      try {
        const native = await ensureAllioNativeBookingForLead(leadId);
        if (!native.skipped) {
          syncLog(leadId, "allio_native_booking", t0);
        }
      } catch (nativeErr) {
        console.error(
          "[post-booking-sync] allio-native fejlede (ikke-fatal):",
          nativeErr instanceof Error ? nativeErr.message : nativeErr,
        );
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
