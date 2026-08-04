import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  getMeetingBlockMinutes,
  isMeetingBlockMinutes,
  MEETING_BLOCK_OPTIONS,
  setMeetingBlockMinutes,
} from "@/lib/booking/meeting-block-setting";

/** GET — aktuel mødeblok (minutter før/efter mødestart). Kun ADMIN. */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const minutes = await getMeetingBlockMinutes();
  return NextResponse.json({ minutes, options: MEETING_BLOCK_OPTIONS });
}

/** PATCH { minutes: 55|75 } — gem mødeblok. Kun ADMIN. */
export async function PATCH(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const minutes = Number(body?.minutes);
  if (!isMeetingBlockMinutes(minutes)) {
    return NextResponse.json(
      { error: `Ugyldig værdi — vælg ${MEETING_BLOCK_OPTIONS.join(" eller ")} minutter.` },
      { status: 400 },
    );
  }

  await setMeetingBlockMinutes(minutes);
  return NextResponse.json({ minutes });
}
