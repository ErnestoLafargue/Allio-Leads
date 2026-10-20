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

  if (body?.clientDebug && typeof body.clientDebug === "object") {
    const dbg = body.clientDebug as {
      hypothesisId?: string;
      location?: string;
      message?: string;
      data?: unknown;
    };
    // #region agent log
    console.warn("[medlyt-debug] client", dbg.hypothesisId, dbg.location, dbg.message, dbg.data);
    fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
      body: JSON.stringify({
        sessionId: "c1392e",
        hypothesisId: dbg.hypothesisId ?? "client",
        location: dbg.location ?? "listen/[id]/route.ts:clientDebug",
        message: dbg.message ?? "client debug",
        data: dbg.data ?? {},
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ ok: true });
  }

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
    // #region agent log
    {
      const dirs = [...body.offerSdp.matchAll(/a=(sendonly|recvonly|sendrecv|inactive)/g)].map(
        (m: RegExpMatchArray) => m[1],
      );
      console.warn("[medlyt-debug] H-sdp admin-offer", { id, dirs: dirs.join(","), len: body.offerSdp.length });
    }
    // #endregion
    return NextResponse.json({ ok: true });
  }

  if (typeof body?.answerSdp === "string" && body.answerSdp.trim()) {
    const result = await setMedlytListenAnswer({
      id,
      targetUserId: uid,
      answerSdp: body.answerSdp,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // #region agent log
    {
      const dirs = [...body.answerSdp.matchAll(/a=(sendonly|recvonly|sendrecv|inactive)/g)].map(
        (m: RegExpMatchArray) => m[1],
      );
      console.warn("[medlyt-debug] H-send seller-answer", { id, dirs: dirs.join(","), len: body.answerSdp.length });
    }
    // #endregion
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
