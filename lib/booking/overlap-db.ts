import { prisma } from "@/lib/prisma";
import { findBookingTimeConflict } from "@/lib/booking/availability";
import { maxMeetingFootprintMinutes } from "@/lib/booking/meeting-type-buffers";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import { MEETING_TYPE_ONLINE, type MeetingType, normalizeMeetingType } from "@/lib/meeting-type";

/** DB-runde for overlappende møder (body + transport — transporter må overlappe hinanden). */
export async function findLeadBookingOverlapInDb(
  proposedStart: Date,
  opts: {
    excludeLeadId?: string;
    excludeLeadIds?: string[];
    /** @deprecated Ignoreres. */
    blockMinutes?: number;
    meetingType?: MeetingType | string;
  } = {},
): Promise<{ id: string } | null> {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const proposedMeetingType = normalizeMeetingType(opts.meetingType ?? MEETING_TYPE_ONLINE);
  const pad = maxMeetingFootprintMinutes() * 60 * 1000;
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
    select: {
      id: true,
      meetingScheduledFor: true,
      meetingOutcomeStatus: true,
      meetingType: true,
    },
  });
  return findBookingTimeConflict(proposedStart, rows, { proposedMeetingType });
}
