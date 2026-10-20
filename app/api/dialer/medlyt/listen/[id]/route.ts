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
      offerSdp: body.offerSdp.trim(),
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
      answerSdp: body.answerSdp.trim(),
    });
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
