import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import { isValidDayKey } from "@/lib/time-clock";
import { getTimeClockOverview } from "@/lib/time-clock-store";

/**
 * GET /api/time-clock/overview?dayKey=YYYY-MM-DD
 *
 * Alle ser egne tider. Admin ser alle brugere for dagen.
 */
export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const requested = new URL(req.url).searchParams.get("dayKey")?.trim() ?? "";
    const dayKey = isValidDayKey(requested) ? requested : copenhagenDayKey();
    const overview = await getTimeClockOverview({
      dayKey,
      viewer: { id: session.user.id, role: session.user.role },
    });
    return NextResponse.json(overview);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[time-clock overview]", e);
    return NextResponse.json(
      { error: "Kunne ikke hente stemplingsoversigt", details: msg },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
export const maxDuration = 15;
