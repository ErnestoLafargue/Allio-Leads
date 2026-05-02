import { NextResponse } from "next/server";
import { sendTomorrowMeetingReminders } from "@/lib/meeting-reminders";

/**
 * Daglig SMS «møde i morgen» til tildelte sælgere.
 *
 * Vercel cron kører i UTC. Én fast UTC-tid rammer ikke altid 18:45 Europe/Copenhagen
 * (CET vs CEST). Derfor to triggers:
 * - 16:45 UTC → 18:45 når Danmark er UTC+2 (sommertid)
 * - 17:45 UTC → 18:45 når Danmark er UTC+1 (vintertid)
 *
 * Ruten tillader kun faktisk afsendelse kl. 18:45 lokalt (eller ?force=1).
 * Den anden daglige kørsel returnerer skipped uden sideeffekter.
 * Idempotens i `MeetingReminderDispatch` forhindrer dobbelt-SMS hvis begge ramte vinduet.
 */
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

