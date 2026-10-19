import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import {
  findBlockedTimeConflict,
  getCopenhagenBookingSlotsForMeetingType,
  occupiedBlocksFromBlockedTimes,
  occupiedBlocksFromNativeOccupancy,
  occupiedBlocksFromScheduledMeetings,
  softOccupiedBlocksFromNativeOccupancy,
  softOccupiedBlocksFromScheduledMeetings,
  type CopenhagenBookingSlotWithAvailability,
} from "@/lib/booking/availability";
import { maxMeetingFootprintMinutes } from "@/lib/booking/meeting-type-buffers";
import {
  meetingTypeForServiceIds,
  parseServiceIdsJson,
} from "@/lib/allio-native/service-buffers";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import { MEETING_TYPE_ONLINE, type MeetingType, normalizeMeetingType } from "@/lib/meeting-type";

export type GetAvailableMeetingSlotsOpts = {
  excludeLeadId?: string;
  /** @deprecated Ignoreres. */
  blockMinutes?: number;
  meetingType?: MeetingType | string;
};

/**
 * Ledige booking-slots for en bruger: møde+transport + manuelle blokeringer + Native occupancy.
 */
export async function getAvailableMeetingSlots(
  userId: string,
  dayKey: string,
  opts: GetAvailableMeetingSlotsOpts = {},
): Promise<CopenhagenBookingSlotWithAvailability[]> {
  const meetingType = normalizeMeetingType(opts.meetingType ?? MEETING_TYPE_ONLINE);
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const padMs = maxMeetingFootprintMinutes() * 60 * 1000;
  const queryStart = new Date(start.getTime() - padMs);
  const queryEnd = new Date(end.getTime() + padMs);

  const [leads, blockedRows, nativeRows] = await Promise.all([
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
        meetingType: true,
        allioBookingId: true,
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
    prisma.allioNativeOccupancy.findMany({
      where: {
        status: { not: "cancelled" },
        startDateTime: { lt: end },
        endDateTime: { gt: start },
      },
      select: { startDateTime: true, endDateTime: true, serviceIds: true },
    }),
  ]);

  // Leads med Native-booking: occupancy er sandheden — undgå dobbeltblok.
  const localOnlyLeads = leads.filter((l) => !l.allioBookingId);
  const resolveType = (raw: string | null | undefined) =>
    meetingTypeForServiceIds(parseServiceIdsJson(raw));

  const manual = occupiedBlocksFromBlockedTimes(blockedRows);
  const hardBlocks = [
    ...occupiedBlocksFromScheduledMeetings(localOnlyLeads),
    ...manual,
    ...occupiedBlocksFromNativeOccupancy(nativeRows, resolveType),
  ];
  const softBlocks = [
    ...softOccupiedBlocksFromScheduledMeetings(localOnlyLeads),
    ...manual,
    ...softOccupiedBlocksFromNativeOccupancy(nativeRows, resolveType),
  ];

  return getCopenhagenBookingSlotsForMeetingType(dayKey, meetingType, hardBlocks, softBlocks);
}

/** Hent manuelle blokeringer der overlapper et foreslået møde (body + transport). */
export async function findBlockedTimeConflictInDb(
  userId: string,
  proposedStart: Date,
  meetingType: MeetingType | string = MEETING_TYPE_ONLINE,
): Promise<{ id: string; title: string } | null> {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const pad = maxMeetingFootprintMinutes() * 60 * 1000;
  const rows = await prisma.blockedTime.findMany({
    where: {
      userId,
      startDateTime: { lte: new Date(startMs + pad) },
      endDateTime: { gte: new Date(startMs - pad) },
    },
    select: { id: true, title: true, startDateTime: true, endDateTime: true },
  });
  return findBlockedTimeConflict(proposedStart, rows, meetingType);
}
