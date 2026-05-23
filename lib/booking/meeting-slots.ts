import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import {
  BOOKING_MEETING_BLOCK_AFTER_MIN,
  BOOKING_MEETING_BLOCK_BEFORE_MIN,
  findBlockedTimeConflict,
  getCopenhagenBookingSlotsWithAvailability,
  occupiedBlocksFromBlockedTimes,
  occupiedBlocksFromScheduledMeetings,
  type CopenhagenBookingSlotWithAvailability,
} from "@/lib/booking/availability";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";

export type GetAvailableMeetingSlotsOpts = {
  excludeLeadId?: string;
};

/**
 * Ledige booking-slots for en bruger: globale mødeblokke (-75/+75) + brugerens manuelle blokeringer.
 */
export async function getAvailableMeetingSlots(
  userId: string,
  dayKey: string,
  opts: GetAvailableMeetingSlotsOpts = {},
): Promise<CopenhagenBookingSlotWithAvailability[]> {
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const beforeMs = BOOKING_MEETING_BLOCK_BEFORE_MIN * 60 * 1000;
  const afterMs = BOOKING_MEETING_BLOCK_AFTER_MIN * 60 * 1000;
  const queryStart = new Date(start.getTime() - afterMs);
  const queryEnd = new Date(end.getTime() + beforeMs);

  const [leads, blockedRows] = await Promise.all([
    prisma.lead.findMany({
      where: {
        status: "MEETING_BOOKED",
        meetingScheduledFor: { not: null, gte: queryStart, lt: queryEnd },
        meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
        ...(opts.excludeLeadId ? { id: { not: opts.excludeLeadId } } : {}),
      },
      select: {
        id: true,
        meetingScheduledFor: true,
        meetingOutcomeStatus: true,
      },
    }),
    prisma.blockedTime.findMany({
      where: {
        userId,
        startDateTime: { lt: end },
        endDateTime: { gt: start },
      },
      select: { startDateTime: true, endDateTime: true },
    }),
  ]);

  const occupied = [
    ...occupiedBlocksFromScheduledMeetings(leads),
    ...occupiedBlocksFromBlockedTimes(blockedRows),
  ];
  return getCopenhagenBookingSlotsWithAvailability(dayKey, occupied);
}

/** Hent manuelle blokeringer der overlapper et foreslået mødetidspunkt. */
export async function findBlockedTimeConflictInDb(
  userId: string,
  proposedStart: Date,
): Promise<{ id: string; title: string } | null> {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const pad = 60 * 60 * 1000;
  const rows = await prisma.blockedTime.findMany({
    where: {
      userId,
      startDateTime: { lte: new Date(startMs + pad) },
      endDateTime: { gte: new Date(startMs - pad) },
    },
    select: { id: true, title: true, startDateTime: true, endDateTime: true },
  });
  return findBlockedTimeConflict(proposedStart, rows);
}
