import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  creditDialerLineOccupancy,
  isDialerLinePhase,
} from "@/lib/dialer-line-occupancy";

/**
 * POST /api/presence/line  { campaignId, linePhase?: "ringing" | "talking" | null }
 *
 * Kreditér sælgerens egen linje (ring/tale) uden at røre login-/kampagnetid.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const campaignId =
    typeof body?.campaignId === "string" && body.campaignId.trim()
      ? body.campaignId.trim()
      : "";
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId er påkrævet" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }

  const linePhase = isDialerLinePhase(body?.linePhase) ? body.linePhase : null;
  await creditDialerLineOccupancy({
    userId: session.user.id,
    campaignId,
    phase: linePhase,
  });

  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
export const maxDuration = 15;
