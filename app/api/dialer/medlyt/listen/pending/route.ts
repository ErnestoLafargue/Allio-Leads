import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { listPendingMedlytListenForSeller } from "@/lib/medlyt-listen";

/** Sælger: hent aktive Medlyt-sessioner rettet mod mig. */
export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const sessions = await listPendingMedlytListenForSeller(session!.user.id);
  // #region agent log
  if (sessions.length > 0) {
    const pub = req.headers.get("x-medlyt-pub");
    fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
      body: JSON.stringify({
        sessionId: "c1392e",
        runId: "post-fix",
        hypothesisId: "H4",
        location: "app/api/dialer/medlyt/listen/pending/route.ts",
        message: "seller polled pending listen",
        data: {
          count: sessions.length,
          ids: sessions.map((s) => s.id),
          statuses: sessions.map((s) => s.status),
          hasOffer: sessions.map((s) => Boolean(s.offerSdp)),
          pub,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    console.warn("[medlyt-debug] H4 seller-pending", {
      count: sessions.length,
      statuses: sessions.map((s) => s.status),
      hasOffer: sessions.map((s) => Boolean(s.offerSdp)),
      pub,
    });
  }
  // #endregion
  return NextResponse.json({
    ok: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      offerSdp: s.offerSdp,
      adminIceJson: s.adminIceJson,
    })),
  });
}

export const runtime = "nodejs";
