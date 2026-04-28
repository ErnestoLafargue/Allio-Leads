import { NextResponse } from "next/server";
import { sendTomorrowMeetingReminders } from "@/lib/meeting-reminders";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  if (!isVercelCron && !authorizedBySecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const [hourStr, minuteStr] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":");
  const hour = Number(hourStr ?? "0");
  const minute = Number(minuteStr ?? "0");
  if (!force && (hour !== 18 || minute !== 45)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Outside 18:45 Europe/Copenhagen window.",
    });
  }

  try {
    const result = await sendTomorrowMeetingReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

