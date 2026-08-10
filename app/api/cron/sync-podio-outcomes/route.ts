import { NextResponse } from "next/server";
import { authorizePodioCron } from "@/lib/podio/cron-auth";
import { isPodioAppConfigured } from "@/lib/podio/client";
import {
  clampReconcileLimit,
  reconcilePodioMeetingOutcomesBatch,
} from "@/lib/podio/reconcile-outcomes";

/**
 * Periodisk reconcile: Podio Møder-status → Allio mødeudfald.
 * Prioritér leads med Afventende/PENDING, så manglende udfald hentes fra Podio.
 *
 * Auth: x-vercel-cron, Bearer CRON_SECRET, eller Podio/AUTH cron-token.
 * GET /api/cron/sync-podio-outcomes?limit=50
 */
function authorize(req: Request): boolean {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  return isVercelCron || authorizedBySecret || authorizePodioCron(req);
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPodioAppConfigured("moeder")) {
    return NextResponse.json(
      { ok: false, error: "Podio Møder-app ikke konfigureret" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "");
  const limit = clampReconcileLimit(Number.isFinite(limitRaw) ? limitRaw : undefined);

  try {
    const result = await reconcilePodioMeetingOutcomesBatch({ limit });
    console.log(
      `[podio-reconcile] checked=${result.checked} updated=${result.updated} noop=${result.noop} ignored=${result.ignored} errors=${result.errors.length}`,
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[podio-reconcile] fejlede:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
