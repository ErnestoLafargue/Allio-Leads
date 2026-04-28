import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtc } from "@/lib/copenhagen-day";

export type MeetingsType = "upcoming" | "past" | "all";

export async function getMeetings(type: MeetingsType) {
  const { start: todayStartUtc } = copenhagenDayBoundsUtc();

  const meetingScheduledForClause =
    type === "upcoming"
      ? { not: null, gte: todayStartUtc }
      : type === "past"
        ? { not: null, lt: todayStartUtc }
        : { not: null };

  return prisma.lead.findMany({
    where: {
      status: "MEETING_BOOKED",
      meetingScheduledFor: meetingScheduledForClause,
    },
    orderBy: { meetingScheduledFor: "asc" },
    include: {
      bookedByUser: { select: { id: true, name: true, username: true } },
      assignedUser: { select: { id: true, name: true, username: true, phone: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
}

