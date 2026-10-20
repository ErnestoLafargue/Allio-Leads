import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { startMedlyt } from "@/lib/medlyt";

/** Admin: start stille medlyt (Telnyx supervise monitor) på en sælgers aktive lead-leg. */
export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const targetUserId =
    typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId mangler." }, { status: 400 });
  }

  const result = await startMedlyt({
    supervisorUserId: session!.user.id,
    targetUserId,
  });
  // #region agent log
  fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
    body: JSON.stringify({
      sessionId: "c1392e",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "app/api/dialer/medlyt/start/route.ts",
      message: "telnyx startMedlyt called",
      data: {
        targetUserId,
        ok: result.ok,
        error: result.ok ? null : result.error,
        status: result.ok ? 200 : result.status,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  console.warn("[medlyt-debug] H1 telnyx-start", {
    targetUserId,
    ok: result.ok,
    error: result.ok ? null : result.error,
  });
  // #endregion
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export const runtime = "nodejs";
export const maxDuration = 30;
