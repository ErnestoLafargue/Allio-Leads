import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { DESKTOP_CLOCK_HEADER, isBlockedTimeClockUserAgent } from "@/lib/desktop-computer";
import { TimeClockError } from "@/lib/time-clock";
import { getTimeClockStatus, punchIn, punchOut } from "@/lib/time-clock-store";

const OFFICE_ONLY =
  "Stempling kan kun ske fra en computer på kontoret — ikke fra telefon eller iPad.";

function rejectNonDesktopPunch(req: Request): NextResponse | null {
  const ua = req.headers.get("user-agent");
  const chMobile = req.headers.get("sec-ch-ua-mobile");
  if (isBlockedTimeClockUserAgent(ua) || chMobile === "?1") {
    return NextResponse.json({ error: OFFICE_ONLY, code: "desktop_only" }, { status: 403 });
  }
  if (req.headers.get(DESKTOP_CLOCK_HEADER) !== "1") {
    return NextResponse.json({ error: OFFICE_ONLY, code: "desktop_only" }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/time-clock — egen stemplingsstatus (alle roller).
 */
export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const status = await getTimeClockStatus(session.user.id);
    return NextResponse.json(status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[time-clock GET]", e);
    return NextResponse.json({ error: "Kunne ikke hente stempling", details: msg }, { status: 500 });
  }
}

/**
 * POST /api/time-clock  { action: "in" | "out" }
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const blocked = rejectNonDesktopPunch(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action === "out" ? "out" : body?.action === "in" ? "in" : null;
  if (!action) {
    return NextResponse.json({ error: "Angiv action: in eller out." }, { status: 400 });
  }

  try {
    const status = action === "in" ? await punchIn(session.user.id) : await punchOut(session.user.id);
    return NextResponse.json(status);
  } catch (e) {
    if (e instanceof TimeClockError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[time-clock POST]", e);
    return NextResponse.json({ error: "Kunne ikke stemple", details: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 15;
