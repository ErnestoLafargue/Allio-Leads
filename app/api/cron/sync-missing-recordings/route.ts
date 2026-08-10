import { NextResponse } from "next/server";
import { syncMissingRecordingsBatch } from "@/lib/telnyx-recordings-auto-sync";

/**
 * Periodisk: find leads med møde booket eller samtale ≥ 60 s uden afspilbar
 * optagelse, og hent dem fra Telnyx (supplement til webhooks + event-triggers).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  if (!isVercelCron && !authorizedBySecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TELNYX_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Mangler TELNYX_API_KEY." },
      { status: 503 },
    );
  }

  try {
    const result = await syncMissingRecordingsBatch({ limit: 20 });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;