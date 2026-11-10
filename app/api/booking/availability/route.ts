import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { normalizePhysicalMeetingsTarget } from "@/lib/booking/availability";
import {
  meetingDurationMinutes,
  transportBufferMinutes,
} from "@/lib/booking/meeting-type-buffers";
import { getDayBookingSlots } from "@/lib/booking/meeting-slots";
import { listDrivingSellers } from "@/lib/meeting-assignee";
import { normalizeMeetingType } from "@/lib/meeting-type";

/**
 * GET ?date=YYYY-MM-DD&excludeLeadId=&meetingType=ONLINE|PHYSICAL&physicalTarget=4|3&adminOverride=1
 * Ledige tider på tværs af kørende sælgere — hver tid med den sælger, den tildeles (prioritet).
 * adminOverride (kun admin): ignorer ugedagsregler for fysiske møder og 3-ugers-grænsen.
 */
export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date")?.trim() ?? "";
  const excludeLeadId = searchParams.get("excludeLeadId")?.trim() || undefined;
  const meetingType = normalizeMeetingType(searchParams.get("meetingType"));
  const physicalMeetingsTarget = normalizePhysicalMeetingsTarget(searchParams.get("physicalTarget"));
  const adminOverride =
    searchParams.get("adminOverride") === "1" && session?.user?.role === "ADMIN";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Angiv date=YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const [{ slots, dayRule, lastBookableDayKey }, sellers] = await Promise.all([
      getDayBookingSlots(date, { excludeLeadId, meetingType, physicalMeetingsTarget, adminOverride }),
      listDrivingSellers(),
    ]);
    const transportMinutes = transportBufferMinutes(meetingType);
    return NextResponse.json({
      meetingType,
      meetingDurationMinutes: meetingDurationMinutes(meetingType),
      transportBufferMinutes: transportMinutes,
      /** Kompatibilitet: transportbuffer (0 online / 60 fysisk). */
      blockMinutes: transportMinutes,
      dayRule,
      lastBookableDayKey,
      sellers: sellers.map((s) => ({ id: s.id, name: s.name })),
      slots: slots.map((s) => ({
        time: s.time,
        utcMs: s.utcMs,
        available: s.available,
        sellerId: s.sellerId,
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
