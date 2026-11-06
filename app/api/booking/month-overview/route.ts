import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { normalizePhysicalMeetingsTarget } from "@/lib/booking/availability";
import { getMonthBookingOverview } from "@/lib/booking/meeting-slots";
import { getDefaultMeetingAssigneeId } from "@/lib/meeting-assignee";
import { normalizeMeetingType } from "@/lib/meeting-type";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Maks. interval pr. kald (en kalendermåned + lidt). */
const MAX_RANGE_DAYS = 62;

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=&excludeLeadId=&meetingType=&physicalTarget=4|3&adminOverride=1
 * Kalender-overblik: åbne onsdage (fysisk) og fyldte dage uden ledige tider.
 * adminOverride (kun admin): ignorer ugedagsregler og 3-ugers-grænsen.
 */
export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  const excludeLeadId = searchParams.get("excludeLeadId")?.trim() || undefined;
  const meetingType = normalizeMeetingType(searchParams.get("meetingType"));
  const physicalMeetingsTarget = normalizePhysicalMeetingsTarget(searchParams.get("physicalTarget"));
  const adminOverride =
    searchParams.get("adminOverride") === "1" && session?.user?.role === "ADMIN";
  if (!DAY_KEY.test(from) || !DAY_KEY.test(to) || from > to) {
    return NextResponse.json({ error: "Angiv from og to som YYYY-MM-DD" }, { status: 400 });
  }
  const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Højst ${MAX_RANGE_DAYS} dage pr. kald` }, { status: 400 });
  }

  const userId = searchParams.get("userId")?.trim() || (await getDefaultMeetingAssigneeId()) || undefined;
  if (!userId) {
    return NextResponse.json({ error: "Ingen standard mødeansvarlig — angiv userId." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getMonthBookingOverview(userId, from, to, {
        excludeLeadId,
        meetingType,
        physicalMeetingsTarget,
        adminOverride,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Kunne ikke hente kalenderoverblik", details: msg }, { status: 500 });
  }
}
