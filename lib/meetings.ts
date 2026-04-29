import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtc } from "@/lib/copenhagen-day";

export type MeetingsType = "upcoming" | "past" | "all";

type GetMeetingsOptions = {
  /**
   * Hvis true: drop kravet om status="MEETING_BOOKED". Bruges på "Vis alle tidligere møder"
   * for også at finde leads, der har haft et booket møde, men hvor lead-status sidenhen
   * er ændret (typisk i rebooking-flow). Påvirker kun "past".
   */
  showAll?: boolean;
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
  // Default: kun aktive booking-leads. showAll for "past" giver hele historikken.
  if (!(type === "past" && options.showAll === true)) {
    where.status = "MEETING_BOOKED";
  }

  return prisma.lead.findMany({
    where,
    orderBy: { meetingScheduledFor: "asc" },
    include: {
      bookedByUser: { select: { id: true, name: true, username: true } },
      assignedUser: { select: { id: true, name: true, username: true, phone: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
}

/** Antal dage hvor admin må ændre udfaldet på et booket møde efter selve booking-tidspunktet. */
export const MEETING_OUTCOME_LOCK_DAYS = 30;

/**
 * True hvis udfaldet er låst, fordi mødet blev booket for mere end MEETING_OUTCOME_LOCK_DAYS dage siden.
 * Bruges både på server (input-validering i PATCH) og klient (deaktiveret select + tooltip).
 */
export function isMeetingOutcomeLocked(
  meetingBookedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!meetingBookedAt) return false;
  const booked = meetingBookedAt instanceof Date ? meetingBookedAt : new Date(meetingBookedAt);
  if (Number.isNaN(booked.getTime())) return false;
  const cutoff = now.getTime() - MEETING_OUTCOME_LOCK_DAYS * 86_400_000;
  return booked.getTime() < cutoff;
}

