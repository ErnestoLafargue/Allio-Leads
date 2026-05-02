import { NextResponse } from "next/server";
import { runRecordingsBackfill } from "@/lib/telnyx-recordings-backfill";

/**
 * Periodisk indhentning af nylige Telnyx-optagelser (API-backfill) som supplement
 * til webhooks — idempotent opdatering af CALL_RECORDING / DialerCallLog.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  if (!isVercelCron && !authorizedBySecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Mangler TELNYX_API_KEY." },
      { status: 503 },
    );
  }

  const hoursBack = 72;
  const fromIso = new Date(Date.now() - hoursBack * 3600000).toISOString();

  try {
    const out = await runRecordingsBackfill({
      apiKey,
      startPage: 1,
      pageSize: 100,
      maxPages: 4,
      fromIso,
      toIso: null,
      dryRun: false,
      copyToBlob: true,
    });

    if (!out.ok) {
      return NextResponse.json(
        { ok: false, status: out.status, error: out.message },
        { status: out.status >= 400 && out.status < 600 ? out.status : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      hoursBack,
      result: out.result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
