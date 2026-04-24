import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { campaignUsesVoipUi, normalizeCampaignDialMode } from "@/lib/dial-mode";
import {
  createTelnyxWebRtcToken,
  getTelnyxCredentialInfo,
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
    const credentialMask =
      telephonyCredentialId.length > 4
        ? `…${telephonyCredentialId.slice(-4)}`
        : telephonyCredentialId;

    // Hent credential detaljer til diagnostik (expired? forkert tilknytning? ikke fundet?)
    const info = await getTelnyxCredentialInfo({ telephonyCredentialId, apiKey });

    const hints: string[] = [];
    let hint: string | null = null;
    if (!info.found) {
      if (info.fetchError && /404|not.?found|ikke.?fundet/i.test(info.fetchError)) {
        hint =
          "Credential-id findes ikke på Telnyx-kontoen. Sæt TELNYX_TELEPHONY_CREDENTIAL_ID til et gyldigt Telephony Credential id.";
      } else {
        hint = "Kunne ikke hente credential fra Telnyx (tjek API-nøgle og credential-id).";
      }
      hints.push(hint);
    } else {
      if (info.expired === true) {
        hint =
          "Credential er udløbet (expired). Opret en ny Telephony Credential og opdater TELNYX_TELEPHONY_CREDENTIAL_ID.";
        hints.push(hint);
      }
      if (info.status && info.status.toLowerCase() !== "active" && info.expired !== true) {
        hints.push(`Credential status: ${info.status}`);
      }
      if (!info.connectionId) {
        hints.push(
          "Credential mangler connection_id — skal være knyttet til en Voice API Application.",
        );
      }
    }

    console.error("[telnyx:webrtc-token] failed", {
      status: token.status,
      message: token.message,
      telephonyCredentialId: credentialMask,
      telnyx: token.telnyx,
      credentialInfo: info,
      hints,
    });

    const messageParts = [token.message];
    if (hints.length > 0) messageParts.push(hints.join(" "));

    return NextResponse.json(
      {
        code: "TELNYX_WEBRTC_TOKEN_FAILED",
        error: messageParts.join(" · "),
        telnyxStatus: token.status,
        telephonyCredentialIdHint: credentialMask,
        credentialStatus: info.status ?? null,
        credentialExpired: info.expired ?? null,
        credentialExpiresAt: info.expiresAt ?? null,
        credentialConnectionId: info.connectionId ?? null,
        credentialFetchError: info.fetchError ?? null,
        diagnosticHint: hint,
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
