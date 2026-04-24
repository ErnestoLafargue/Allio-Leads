import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { encodeDialerClientState } from "@/lib/dialer-shared";
import { sellerMayEditLead } from "@/lib/lead-lock";

/**
 * POST /api/telnyx/manual-call/prepare
 *
 * Bruges af WebRTC click-to-call (campaign-voip-strip) inden `client.newCall()`:
 * frontenden henter et `clientState` der pakker {leadId, userId, campaignId, kind:"manual"}
 * ind, og sender det til Telnyx via newCall'ens `clientState` option.
 *
 * Når Telnyx fyrer webhooks (call.answered, call.recording.saved) returneres samme
 * clientState, så vi kan:
 *   1. starte optagelse straks ved call.answered (kun ved kind=manual; AMD-flowet
 *      starter optagelse selv efter human-detection),
 *   2. oprette en CALL_RECORDING-aktivitet på det rigtige lead når recording er klar.
 *
 * Kun parat-til-leadet-bruger har adgang.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  if (!leadId) {
    return NextResponse.json({ error: "leadId er påkrævet" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      campaignId: true,
      lockedByUserId: true,
      lockedAt: true,
      lockExpiresAt: true,
    },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead findes ikke" }, { status: 404 });
  }
  if (!lead.campaignId) {
    return NextResponse.json(
      { error: "Lead er ikke tilknyttet en kampagne." },
      { status: 409 },
    );
  }

  // Samme adgangsregler som calls/start: ADMIN må altid; sælgere må hvis lock er
  // udløbet eller deres egen.
  if (!sellerMayEditLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json(
      { error: "Leadet er låst af en anden bruger." },
      { status: 403 },
    );
  }

  const clientState = encodeDialerClientState({
    v: 1,
    kind: "manual",
    campaignId: lead.campaignId,
    leadId: lead.id,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true, clientState });
}

export const runtime = "nodejs";
