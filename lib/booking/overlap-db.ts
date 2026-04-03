import { prisma } from "@/lib/prisma";
import {
  BOOKING_MEETING_BLOCK_AFTER_MIN,
  BOOKING_MEETING_BLOCK_BEFORE_MIN,
  findBookingTimeConflict,
} from "@/lib/booking/availability";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";

/** DB-runde for overlappende mødeblokke (-60/+75) (undtagen annullerede). */
export async function findLeadBookingOverlapInDb(
  proposedStart: Date,
  opts: { excludeLeadId?: string; excludeLeadIds?: string[] } = {},
): Promise<{ id: string } | null> {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const pad = (BOOKING_MEETING_BLOCK_BEFORE_MIN + BOOKING_MEETING_BLOCK_AFTER_MIN) * 60 * 1000;
  const exclude = opts.excludeLeadIds?.length
    ? opts.excludeLeadIds
    : opts.excludeLeadId
      ? [opts.excludeLeadId]
      : [];

  const rows = await prisma.lead.findMany({
    where: {
      status: "MEETING_BOOKED",
      meetingScheduledFor: {
        not: null,
        gte: new Date(startMs - pad),
        lte: new Date(startMs + pad),
      },
      meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
    },
    select: { id: true, meetingScheduledFor: true, meetingOutcomeStatus: true },
  });
  return findBookingTimeConflict(proposedStart, rows);
}
