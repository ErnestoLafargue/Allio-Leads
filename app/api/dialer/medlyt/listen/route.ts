import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { createMedlytListenSession } from "@/lib/medlyt-listen";

/** Admin: opret browser-Medlyt-session (WebRTC-signalering). */
export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const targetUserId =
    typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId mangler." }, { status: 400 });
  }

  const result = await createMedlytListenSession({
    adminUserId: session!.user.id,
    targetUserId,
  });
  // #region agent log
  fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
    body: JSON.stringify({
      sessionId: "c1392e",
      runId: "pre-fix",
      hypothesisId: "H5",
      location: "app/api/dialer/medlyt/listen/route.ts",
      message: "browser listen session create",
      data: {
        targetUserId,
        ok: result.ok,
        error: result.ok ? null : result.error,
        sessionId: result.ok ? result.session.id : null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  console.warn("[medlyt-debug] H5 listen-create", {
    targetUserId,
    ok: result.ok,
    error: result.ok ? null : result.error,
    sessionId: result.ok ? result.session.id : null,
  });
  // #endregion
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, sessionId: result.session.id });
}

export const runtime = "nodejs";
