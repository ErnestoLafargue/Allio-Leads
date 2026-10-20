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
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, sessionId: result.session.id });
}

export const runtime = "nodejs";
