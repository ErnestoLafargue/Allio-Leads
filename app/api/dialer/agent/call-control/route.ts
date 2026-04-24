import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * POST { campaignId: string, callControlId: string | null }
 *
 * Agentens browser sender Telnyx call_control_id fra det aktive WebRTC-opkald når
 * samtalen er etableret, og null når der ikke længere er et aktivt opkald.
 * Gør det muligt for serveren at se hvilken leg der er «live» pr. agent — grundlag
 * for monitorering og fremtidig optimering af bridge uden ekstra originate.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  const body = await req.json().catch(() => null);
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const callControlId =
    body?.callControlId === null || body?.callControlId === ""
      ? null
      : typeof body?.callControlId === "string"
        ? body.callControlId.trim()
        : null;

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId er påkrævet" }, { status: 400 });
  }

  const updated = await prisma.agentSession.updateMany({
    where: { userId, campaignId },
    data: { webRtcCallControlId: callControlId },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { ok: false, error: "Ingen AgentSession — send presence (POST /api/dialer/agent/presence) først." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
