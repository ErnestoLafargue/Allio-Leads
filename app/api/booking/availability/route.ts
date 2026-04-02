import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import {
  BOOKING_MEETING_BLOCK_MIN,
  getMeetingBlockEndMs,
  occupiedBlocksFromScheduledMeetings,
} from "@/lib/booking/availability";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";

/**
 * GET ?date=YYYY-MM-DD&excludeLeadId=
 * Returnerer 75-min blokke for afventende møder der kan påvirke ledige tider den dag.
 */
export async function GET(req: Request) {
  const { response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date")?.trim() ?? "";
  const excludeLeadId = searchParams.get("excludeLeadId")?.trim() || undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Angiv date=YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const { start, end } = copenhagenDayBoundsUtcFromDayKey(date);
    const bufferMs = BOOKING_MEETING_BLOCK_MIN * 60 * 1000;
    const queryStart = new Date(start.getTime() - bufferMs);
    const queryEnd = end;

    const leads = await prisma.lead.findMany({
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
    });

    const occupied = occupiedBlocksFromScheduledMeetings(leads);
    const blocks = occupied.map((b) => ({
      start: new Date(b.startMs).toISOString(),
      end: new Date(b.endMs).toISOString(),
    }));

    return NextResponse.json({ blocks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke hente booking-tilgængelighed", details: msg },
      { status: 500 },
    );
  }
}
