import { NextResponse } from "next/server";
import { purgeExpiredRecordings } from "@/lib/recording-retention";

/**
 * Slet lydfiler ældre end 12 måneder (Blob + afspilnings-URL).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  if (!isVercelCron && !authorizedBySecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await purgeExpiredRecordings({ limit: 40 });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
