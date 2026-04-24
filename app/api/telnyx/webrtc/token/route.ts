import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { campaignUsesVoipUi, normalizeCampaignDialMode } from "@/lib/dial-mode";
import {
  createTelnyxWebRtcToken,
  getTelnyxTelephonyCredentialId,
  pickTelnyxFromNumber,
} from "@/lib/telnyx-call-control";

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const campaignIdFromBody = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  if (!leadId) {
    return NextResponse.json({ error: "leadId er påkrævet" }, { status: 400 });
  }

  await releaseExpiredLocksEverywhere(prisma);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      campaign: { select: { id: true, dialMode: true } },
    },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead findes ikke" }, { status: 404 });
  }
  if (campaignIdFromBody && lead.campaignId !== campaignIdFromBody) {
    return NextResponse.json({ error: "Lead hører ikke til den angivne kampagne." }, { status: 403 });
  }

  const mode = normalizeCampaignDialMode(lead.campaign?.dialMode);
  if (!campaignUsesVoipUi(mode)) {
    return NextResponse.json({ error: "Kampagnen er ikke sat til et opkalds-mode (VoIP)." }, { status: 409 });
  }
  if (!sellerMayEditLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Leadet er låst af en anden bruger." }, { status: 409 });
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { code: "TELNYX_NOT_CONFIGURED", error: "Mangler TELNYX_API_KEY." },
      { status: 503 },
    );
  }
  const telephonyCredentialId = getTelnyxTelephonyCredentialId();
  if (!telephonyCredentialId) {
    return NextResponse.json(
      {
        code: "TELNYX_TELEPHONY_CREDENTIAL_MISSING",
        error: "Mangler TELNYX_TELEPHONY_CREDENTIAL_ID til browser WebRTC login_token.",
      },
      { status: 503 },
    );
  }

  const callerNumber = pickTelnyxFromNumber(leadId);
  if (!callerNumber) {
    return NextResponse.json(
      {
        code: "TELNYX_FROM_MISSING",
        error: "Sæt TELNYX_FROM_NUMBER eller TELNYX_FROM_NUMBERS.",
      },
      { status: 503 },
    );
  }

  const token = await createTelnyxWebRtcToken({ telephonyCredentialId, apiKey });
  if (!token.ok) {
    const status = token.status >= 500 ? 502 : 400;
    return NextResponse.json(
      {
        code: "TELNYX_WEBRTC_TOKEN_FAILED",
        error: token.message,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    loginToken: token.token,
    callerNumber,
    dialMode: mode,
  });
}
