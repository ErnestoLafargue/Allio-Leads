import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  BOOKING_MEETING_BLOCK_AFTER_MIN,
  BOOKING_MEETING_BLOCK_BEFORE_MIN,
  occupiedBlocksFromBlockedTimes,
  occupiedBlocksFromScheduledMeetings,
} from "@/lib/booking/availability";
import { getAvailableMeetingSlots } from "@/lib/booking/meeting-slots";
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import { getDefaultMeetingAssigneeId } from "@/lib/meeting-assignee";
import { prisma } from "@/lib/prisma";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";

/**
 * GET ?date=YYYY-MM-DD&userId=&excludeLeadId=
 * Returnerer samlede optagne blokke (globale møder ±75 + brugerens manuelle blokeringer).
 */
export async function GET(req: Request) {
  const { response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date")?.trim() ?? "";
  const excludeLeadId = searchParams.get("excludeLeadId")?.trim() || undefined;
  let userId = searchParams.get("userId")?.trim() || undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Angiv date=YYYY-MM-DD" }, { status: 400 });
  }

  if (!userId) {
    userId = (await getDefaultMeetingAssigneeId()) ?? undefined;
  }
  if (!userId) {
    return NextResponse.json(
      { error: "Ingen standard mødeansvarlig — angiv userId." },
      { status: 400 },
    );
  }

  try {
    const { start, end } = copenhagenDayBoundsUtcFromDayKey(date);
    const beforeMs = BOOKING_MEETING_BLOCK_BEFORE_MIN * 60 * 1000;
    const afterMs = BOOKING_MEETING_BLOCK_AFTER_MIN * 60 * 1000;
    const queryStart = new Date(start.getTime() - afterMs);
    const queryEnd = new Date(end.getTime() + beforeMs);

    const [leads, blockedRows, slots] = await Promise.all([
      prisma.lead.findMany({
        where: {
          status: "MEETING_BOOKED",
          meetingScheduledFor: { not: null, gte: queryStart, lt: queryEnd },
          meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
          ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
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
      getAvailableMeetingSlots(userId, date, { excludeLeadId }),
    ]);

    const occupied = [
      ...occupiedBlocksFromScheduledMeetings(leads),
      ...occupiedBlocksFromBlockedTimes(blockedRows),
    ];
    const blocks = occupied.map((b) => ({
      start: new Date(b.startMs).toISOString(),
      end: new Date(b.endMs).toISOString(),
    }));

    return NextResponse.json({
      blocks,
      userId,
      slots: slots.map((s) => ({
        time: s.time,
        utcMs: s.utcMs,
        available: s.available,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke hente booking-tilgængelighed", details: msg },
      { status: 500 },
    );
  }
}
