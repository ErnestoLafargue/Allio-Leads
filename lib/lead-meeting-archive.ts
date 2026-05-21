import type { Lead, Prisma } from "@prisma/client";
import { copenhagenDayBoundsUtc } from "@/lib/copenhagen-day";

export type LeadMeetingArchiveReason = "rebooked" | "admin_seller_change";

export type LeadMeetingSnapshotSource = Pick<
  Lead,
  | "id"
  | "bookedByUserId"
  | "meetingBookedAt"
  | "meetingScheduledFor"
  | "meetingOutcomeStatus"
  | "meetingCommissionDayKey"
  | "bookedFromRebookingCampaign"
  | "meetingContactName"
  | "meetingContactEmail"
  | "meetingContactPhonePrivate"
>;

/** True når der allerede er et booket møde og klienten bekræfter en ny mødetid. */
export function isNewMeetingBookingConfirm(
  existing: Pick<Lead, "meetingBookedAt" | "meetingScheduledFor">,
  nextScheduledFor: Date | null | undefined,
): boolean {
  if (!existing.meetingBookedAt || !existing.meetingScheduledFor || !nextScheduledFor) {
    return false;
  }
  return existing.meetingScheduledFor.getTime() !== nextScheduledFor.getTime();
}

/** True hvis den nye mødetid ligger i fremtiden (kalenderdag København). */
export function isFutureMeetingTime(scheduledFor: Date, now: Date = new Date()): boolean {
  const { start: todayStartUtc } = copenhagenDayBoundsUtc(now);
  return scheduledFor.getTime() >= todayStartUtc.getTime();
}

export function leadMeetingRecordCreateInput(
  lead: LeadMeetingSnapshotSource,
  reason: LeadMeetingArchiveReason,
): Prisma.LeadMeetingRecordCreateInput {
  if (!lead.bookedByUserId || !lead.meetingBookedAt || !lead.meetingScheduledFor) {
    throw new Error("Kan ikke arkivere møde uden booker, booking-tid og mødetid.");
  }
  return {
    lead: { connect: { id: lead.id } },
    bookedByUser: { connect: { id: lead.bookedByUserId } },
    meetingBookedAt: lead.meetingBookedAt,
    meetingScheduledFor: lead.meetingScheduledFor,
    meetingOutcomeStatus: lead.meetingOutcomeStatus,
    meetingCommissionDayKey: lead.meetingCommissionDayKey ?? "",
    bookedFromRebookingCampaign: lead.bookedFromRebookingCampaign ?? false,
    meetingContactName: lead.meetingContactName ?? "",
    meetingContactEmail: lead.meetingContactEmail ?? "",
    meetingContactPhonePrivate: lead.meetingContactPhonePrivate ?? "",
    archivedReason: reason,
  };
}
