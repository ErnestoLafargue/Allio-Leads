import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  occupiedBlocksFromBlockedTimes,
  occupiedBlocksFromNativeOccupancy,
  occupiedBlocksFromScheduledMeetings,
} from "@/lib/booking/availability";
import {
  meetingDurationMinutes,
  maxMeetingFootprintMinutes,
  transportBufferMinutes,
} from "@/lib/booking/meeting-type-buffers";
import { getAvailableMeetingSlots } from "@/lib/booking/meeting-slots";
import {
  meetingTypeForServiceIds,
  parseServiceIdsJson,
} from "@/lib/allio-native/service-buffers";
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import { getDefaultMeetingAssigneeId } from "@/lib/meeting-assignee";
import { prisma } from "@/lib/prisma";
import { MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import { normalizeMeetingType } from "@/lib/meeting-type";

/**
 * GET ?date=YYYY-MM-DD&userId=&excludeLeadId=&meetingType=ONLINE|PHYSICAL
 * Returnerer optagne hard-blokke (møde+transport+manuel+Native) og slots for mødetypen.
 */
export async function GET(req: Request) {
  const { response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date")?.trim() ?? "";
  const excludeLeadId = searchParams.get("excludeLeadId")?.trim() || undefined;
  let userId = searchParams.get("userId")?.trim() || undefined;
  const meetingType = normalizeMeetingType(searchParams.get("meetingType"));

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
    const padMs = maxMeetingFootprintMinutes() * 60 * 1000;
    const queryStart = new Date(start.getTime() - padMs);
    const queryEnd = new Date(end.getTime() + padMs);
    const durationMinutes = meetingDurationMinutes(meetingType);
    const transportMinutes = transportBufferMinutes(meetingType);

    const [leads, blockedRows, nativeRows, slots] = await Promise.all([
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
      getAvailableMeetingSlots(userId, date, { excludeLeadId, meetingType }),
    ]);

    const localOnlyLeads = leads.filter((l) => !l.allioBookingId);
    const resolveType = (raw: string | null | undefined) =>
      meetingTypeForServiceIds(parseServiceIdsJson(raw));

    const occupied = [
      ...occupiedBlocksFromScheduledMeetings(localOnlyLeads),
      ...occupiedBlocksFromBlockedTimes(blockedRows),
      ...occupiedBlocksFromNativeOccupancy(nativeRows, resolveType),
    ];
    const blocks = occupied.map((b) => ({
      start: new Date(b.startMs).toISOString(),
      end: new Date(b.endMs).toISOString(),
    }));

    return NextResponse.json({
      blocks,
      userId,
      meetingType,
      meetingDurationMinutes: durationMinutes,
      transportBufferMinutes: transportMinutes,
      /** Kompatibilitet: transportbuffer (0 online / 60 fysisk). */
      blockMinutes: transportMinutes,
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
