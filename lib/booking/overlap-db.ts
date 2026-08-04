import { prisma } from "@/lib/prisma";
import { findBookingTimeConflict } from "@/lib/booking/availability";
import { getMeetingBlockMinutes } from "@/lib/booking/meeting-block-setting";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";

/** DB-runde for overlappende mødeblokke (±mødeblok-minutter) (undtagen annullerede). */
export async function findLeadBookingOverlapInDb(
  proposedStart: Date,
  opts: { excludeLeadId?: string; excludeLeadIds?: string[]; blockMinutes?: number } = {},
): Promise<{ id: string } | null> {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const blockMinutes = opts.blockMinutes ?? (await getMeetingBlockMinutes());
  const pad = 2 * blockMinutes * 60 * 1000;
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
  return findBookingTimeConflict(proposedStart, rows, {
    blockBeforeMinutes: blockMinutes,
    blockAfterMinutes: blockMinutes,
  });
}
