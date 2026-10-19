import { prisma } from "@/lib/prisma";
import type { AllioBooking } from "@/lib/allio-native/client";
import { parseLeadIdFromAllioNotes } from "@/lib/allio-native/notes";
import {
  removeNativeOccupancy,
  upsertNativeOccupancyFromBooking,
} from "@/lib/allio-native/occupancy";
import { isAllioNativeSyncLocked } from "@/lib/allio-native/sync-lock";
import { applyCalRebook } from "@/lib/calcom/webhook-apply";
import { ensureCalComBookingForLead } from "@/lib/calcom/sync-lead-booking";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";
import {
  MEETING_TYPE_PHYSICAL,
  normalizeMeetingType,
} from "@/lib/meeting-type";
import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import { MOEDE_STATUS, updateMoedeInPodio } from "@/lib/podio/meeting-sync";

async function findLeadForNativeBooking(booking: AllioBooking): Promise<{
  id: string;
  allioBookingId: string | null;
  meetingOutcomeStatus: string;
} | null> {
  if (booking.id) {
    const byId = await prisma.lead.findFirst({
      where: { allioBookingId: booking.id },
      select: { id: true, allioBookingId: true, meetingOutcomeStatus: true },
    });
    if (byId) return byId;
  }
  const fromNotes = parseLeadIdFromAllioNotes(booking.notes);
  if (fromNotes) {
    const byNotes = await prisma.lead.findUnique({
      where: { id: fromNotes },
      select: { id: true, allioBookingId: true, meetingOutcomeStatus: true },
    });
    if (byNotes) return byNotes;
  }
  return null;
}

function bookingEndMs(booking: AllioBooking): number | null {
  if (booking.end_time) {
    const end = new Date(booking.end_time).getTime();
    if (!Number.isNaN(end)) return end;
  }
  if (booking.start_time && typeof booking.duration_minutes === "number") {
    const start = new Date(booking.start_time).getTime();
    if (!Number.isNaN(start)) return start + booking.duration_minutes * 60_000;
  }
  return null;
}

/**
 * Behandl Allio-Native booking-event.
 * - Occupancy spejles altid (start/slut/længde) så Leads-kalenderen matcher Native ± buffer.
 * - Vores møde: opdatér Lead (tid) uden at synke tilbage til Native.
 */
export async function applyAllioNativeBookingEvent(input: {
  type: "booking.created" | "booking.updated" | "booking.deleted";
  data: AllioBooking;
  previous_attributes?: Partial<AllioBooking> | null;
}): Promise<{ handled: string }> {
  const booking = input.data;
  if (!booking?.id) return { handled: "ignored_no_id" };

  const status = String(booking.status ?? "confirmed").toLowerCase();
  const isDeleted = input.type === "booking.deleted" || status === "cancelled";

  const lead = await findLeadForNativeBooking(booking);

  if (lead) {
    if (await isAllioNativeSyncLocked(lead.id)) {
      return { handled: "echo_skipped" };
    }

    if (!lead.allioBookingId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { allioBookingId: booking.id },
      });
    }

    if (isDeleted) {
      await removeNativeOccupancy(booking.id);
      if (
        normalizeMeetingOutcomeStatus(lead.meetingOutcomeStatus) === MEETING_OUTCOME_REBOOK
      ) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { allioBookingId: null },
        });
        return { handled: "lead_already_rebook" };
      }
      await applyCalRebook(lead.id, {
        source: "cancelled",
        reason: "Aflyst i Allio-Native",
        mirrorToPodio: true,
        skipNativeCancel: true,
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { allioBookingId: null },
      });
      return { handled: "lead_cancelled" };
    }

    // Spejl længde/tid til occupancy med det samme (også når kun duration ændres).
    await upsertNativeOccupancyFromBooking(booking, status);

    if (!booking.start_time) return { handled: "lead_occupancy_only" };

    const newStart = new Date(booking.start_time);
    if (Number.isNaN(newStart.getTime())) return { handled: "lead_occupancy_only" };

    const current = await prisma.lead.findUnique({
      where: { id: lead.id },
      select: {
        meetingScheduledFor: true,
        meetingContactName: true,
        meetingContactEmail: true,
        meetingContactPhonePrivate: true,
        meetingType: true,
        meetingAddress: true,
        calComBookingUid: true,
        allioBookingId: true,
      },
    });

    const prevEnd = input.previous_attributes?.end_time
      ? new Date(input.previous_attributes.end_time).getTime()
      : null;
    const nextEnd = bookingEndMs(booking);
    const startChanged =
      !current?.meetingScheduledFor ||
      Math.abs(current.meetingScheduledFor.getTime() - newStart.getTime()) > 60_000;
    const durationChanged =
      typeof nextEnd === "number" &&
      (prevEnd == null || Math.abs(prevEnd - nextEnd) > 60_000);

    if ((startChanged || durationChanged) && current) {
      if (startChanged) {
        const upcomingCampaignId = await ensureSystemCampaignId("upcoming_meetings");
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            meetingScheduledFor: newStart,
            meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
            status: "MEETING_BOOKED",
            campaignId: upcomingCampaignId,
          },
        });

        await updateMoedeInPodio(lead.id, {
          status: MOEDE_STATUS.afventer,
          newStart,
        });

        if (
          current.meetingContactName &&
          current.meetingContactEmail &&
          normalizeMeetingType(current.meetingType) !== MEETING_TYPE_PHYSICAL
        ) {
          await ensureCalComBookingForLead({
            leadId: lead.id,
            start: newStart,
            attendeeName: current.meetingContactName,
            attendeeEmail: current.meetingContactEmail,
            attendeePhone: current.meetingContactPhonePrivate || undefined,
            replaceExisting: Boolean(current.calComBookingUid),
            meetingType: current.meetingType,
            meetingAddress: current.meetingAddress,
          });
        }

        const refreshed = await prisma.lead.findUnique({
          where: { id: lead.id },
          select: { calComMeetingUrl: true },
        });
        if (refreshed?.calComMeetingUrl) {
          await updateMoedeInPodio(lead.id, {
            newStart,
            meetingUrl: refreshed.calComMeetingUrl,
          });
        }
      }

      const durationMin =
        typeof booking.duration_minutes === "number"
          ? booking.duration_minutes
          : nextEnd != null
            ? Math.round((nextEnd - newStart.getTime()) / 60_000)
            : null;

      await prisma.leadActivityEvent.create({
        data: {
          leadId: lead.id,
          userId: null,
          kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
          summary: startChanged
            ? `Mødetid opdateret fra Allio-Native${durationMin != null ? ` (${durationMin} min)` : ""}.`
            : `Mødelængde opdateret fra Allio-Native${durationMin != null ? ` (${durationMin} min)` : ""}.`,
        },
      });

      return {
        handled: startChanged ? "lead_rescheduled" : "lead_duration_updated",
      };
    }

    return { handled: "lead_occupancy_synced" };
  }

  if (isDeleted) {
    await removeNativeOccupancy(booking.id);
    return { handled: "occupancy_removed" };
  }
  await upsertNativeOccupancyFromBooking(booking, status || "confirmed");
  return { handled: "occupancy_upserted" };
}
