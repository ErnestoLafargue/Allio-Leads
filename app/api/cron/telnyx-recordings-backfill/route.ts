import { NextResponse } from "next/server";
import { runRecordingsBackfill } from "@/lib/telnyx-recordings-backfill";
import { syncMissingRecordingsBatch } from "@/lib/telnyx-recordings-auto-sync";

/**
 * Periodisk indhentning af nylige Telnyx-optagelser (API-backfill) — idempotent opdatering
 * af CALL_RECORDING / DialerCallLog og kopi til Vercel Blob.
 *
 * Sælgernes WebRTC-forbindelser sender ingen webhooks, så denne cron er det eneste, der
 * gemmer deres optagelser i Allio, før Telnyx sletter dem. Den kører derfor hvert 10. minut
 * (`?hours=6`) og om natten med 72 timer, som også kører målrettet sync for leads med møde
 * booket / lange samtaler uden lydfil.
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

  const startedAt = Date.now();
  const hoursParam = Number(new URL(req.url).searchParams.get("hours"));
  const hoursBack = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 24 * 14) : 72;
  const fromIso = new Date(startedAt - hoursBack * 3600000).toISOString();
  const runMissingSync = hoursBack >= 24;

  try {
    const out = await runRecordingsBackfill({
      apiKey,
      startPage: 1,
      pageSize: 100,
      maxPages: 20,
      fromIso,
      toIso: null,
      dryRun: false,
      copyToBlob: true,
      deadlineAt: startedAt + (runMissingSync ? 35_000 : 50_000),
    });

    if (!out.ok) {
      return NextResponse.json(
        { ok: false, status: out.status, error: out.message },
        { status: out.status >= 400 && out.status < 600 ? out.status : 502 },
      );
    }

    let missingSync: Awaited<ReturnType<typeof syncMissingRecordingsBatch>> | null = null;
    try {
      if (runMissingSync) missingSync = await syncMissingRecordingsBatch({ limit: 20 });
    } catch (err) {
      console.error(
        "[cron:telnyx-recordings-backfill] missing-sync failed:",
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({
      ok: true,
      hoursBack,
      result: out.result,
      missingSync,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
