import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtc } from "@/lib/copenhagen-day";

export type MeetingsType = "upcoming" | "past" | "all";

type GetMeetingsOptions = {
  /**
   * Kun for "past": hvis true, vis kun leads der stadig har status MEETING_BOOKED.
   * Default (false/undefined) viser alle leads med en tidligere mødetid.
   */
  activeOnly?: boolean;
};

export async function getMeetings(type: MeetingsType, options: GetMeetingsOptions = {}) {
  const { start: todayStartUtc } = copenhagenDayBoundsUtc();

  const meetingScheduledForClause =
    type === "upcoming"
      ? { not: null, gte: todayStartUtc }
      : type === "past"
        ? { not: null, lt: todayStartUtc }
        : { not: null };

  const where: Record<string, unknown> = {
    meetingScheduledFor: meetingScheduledForClause,
  };
  if (type === "past" && options.activeOnly === true) {
    where.status = "MEETING_BOOKED";
  }

  return prisma.lead.findMany({
    where,
    orderBy: { meetingScheduledFor: "asc" },
    // Kun de felter møde-listen/-kalenderen viser — ikke noter, customFields m.m. pr. lead.
    select: {
      id: true,
      companyName: true,
      meetingContactName: true,
      phone: true,
      meetingBookedAt: true,
      meetingScheduledFor: true,
      meetingType: true,
      meetingOutcomeStatus: true,
      bookedByUser: { select: { id: true, name: true, username: true } },
      assignedUser: { select: { id: true, name: true, username: true, phone: true } },
      campaign: { select: { id: true, name: true, systemCampaignType: true } },
    },
  });
}

export { isMeetingOutcomeLocked, MEETING_OUTCOME_LOCK_DAYS } from "@/lib/meeting-outcome-lock";
