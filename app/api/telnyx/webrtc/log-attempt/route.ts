import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { normalizeCampaignDialMode, campaignUsesVoipUi } from "@/lib/dial-mode";
import { LEAD_ACTIVITY_KIND, formatPhoneForActivitySummary } from "@/lib/lead-activity-kinds";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { assertLeadMatchesActiveCampaignQueueOr403 } from "@/lib/active-campaign-queue";
import { isGlobalLeadPageVoipContext, parseVoipApiContext, VOIP_API_CONTEXT } from "@/lib/voip-api-context";

/**
 * Efter `client.newCall()` (WebRTC) findes intet kald til `/api/telnyx/calls/start`, så
 * `CALL_ATTEMPT` blev ikke oprettet. Denne rute sikrer at Cost/aktivitet tæller opkald.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const toE164 = typeof body?.toE164 === "string" ? body.toE164.trim() : "";
  const voipApiContext = parseVoipApiContext(body);
  if (!leadId) {
    return NextResponse.json({ error: "leadId er påkrævet" }, { status: 400 });
  }

  await releaseExpiredLocksEverywhere(prisma);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { campaign: { select: { dialMode: true } } },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead findes ikke" }, { status: 404 });
  }

  if (voipApiContext !== VOIP_API_CONTEXT.GLOBAL_LEAD_PAGE) {
    const mode = normalizeCampaignDialMode(lead.campaign?.dialMode);
    if (!campaignUsesVoipUi(mode)) {
      return NextResponse.json({ error: "Kampagnen bruger ikke VoIP." }, { status: 409 });
    }
  }

  if (!sellerMayEditLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Leadet er låst af en anden bruger." }, { status: 403 });
  }

  if (!isGlobalLeadPageVoipContext(voipApiContext)) {
    const guard = await assertLeadMatchesActiveCampaignQueueOr403(prisma, leadId);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: 403 });
    }
  }

  const e164 = toE164 ? normalizePhoneToE164ForDial(toE164) : null;
  const phoneLabel = e164 ? formatPhoneForActivitySummary(e164) : "ukendt nummer";
  const summary = `WebRTC: opkald startet til ${phoneLabel}`;

  try {
    await prisma.leadActivityEvent.create({
      data: {
        leadId,
        userId: session.user.id,
        kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
        summary: summary.slice(0, 2000),
      },
    });
  } catch (err) {
    console.error("[webrtc/log-attempt] create activity failed:", err);
    return NextResponse.json({ error: "Kunne ikke logge aktivitet." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
export const maxDuration = 30;
