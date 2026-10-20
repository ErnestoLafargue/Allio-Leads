import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  appendMedlytListenIce,
  endMedlytListenSession,
  getMedlytListenSession,
  setMedlytListenAnswer,
  setMedlytListenOffer,
  type MedlytIceCandidate,
} from "@/lib/medlyt-listen";

type Ctx = { params: Promise<{ id: string }> };

/** Hent session (admin eller target). */
export async function GET(_req: Request, ctx: Ctx) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await ctx.params;
  const row = await getMedlytListenSession(id);
  if (!row) {
    return NextResponse.json({ error: "Session ikke fundet." }, { status: 404 });
  }
  const uid = session!.user.id;
  if (row.adminUserId !== uid && row.targetUserId !== uid) {
    return NextResponse.json({ error: "Ikke din session." }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    session: {
      id: row.id,
      status: row.status,
      offerSdp: row.offerSdp,
      answerSdp: row.answerSdp,
      adminIceJson: row.adminIceJson,
      sellerIceJson: row.sellerIceJson,
      adminUserId: row.adminUserId,
      targetUserId: row.targetUserId,
    },
  });
}

/**
 * PATCH: offer / answer / ice / end
 * Body: { offerSdp? } | { answerSdp? } | { ice, role } | { end: true }
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await ctx.params;
  const uid = session!.user.id;
  const body = await req.json().catch(() => null);

  if (body?.end === true) {
    const result = await endMedlytListenSession({ id, userId: uid });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.offerSdp === "string" && body.offerSdp.trim()) {
    const result = await setMedlytListenOffer({
      id,
      adminUserId: uid,
      offerSdp: body.offerSdp,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.answerSdp === "string" && body.answerSdp.trim()) {
    const result = await setMedlytListenAnswer({
      id,
      targetUserId: uid,
      answerSdp: body.answerSdp,
    });
    // #region agent log
    fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
      body: JSON.stringify({
        sessionId: "c1392e",
        runId: "post-fix",
        hypothesisId: "H4",
        location: "app/api/dialer/medlyt/listen/[id]/route.ts",
        message: "seller answer PATCH",
        data: { id, ok: result.ok, error: result.ok ? null : result.error },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    console.warn("[medlyt-debug] H4 seller-answer", {
      id,
      ok: result.ok,
      error: result.ok ? null : result.error,
    });
    // #endregion
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.ice && (body.role === "admin" || body.role === "seller")) {
    const ice = body.ice as MedlytIceCandidate;
    if (!ice || typeof ice !== "object") {
      return NextResponse.json({ error: "ice mangler." }, { status: 400 });
    }
    const result = await appendMedlytListenIce({
      id,
      userId: uid,
      role: body.role,
      candidate: ice,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ugyldigt PATCH-body." }, { status: 400 });
}

export const runtime = "nodejs";
