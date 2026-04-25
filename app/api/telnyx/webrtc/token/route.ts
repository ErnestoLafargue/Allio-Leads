import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { campaignUsesVoipUi, normalizeCampaignDialMode } from "@/lib/dial-mode";
import { isGlobalLeadPageVoipContext, parseVoipApiContext, VOIP_API_CONTEXT } from "@/lib/voip-api-context";
import {
  createTelnyxWebRtcToken,
  getTelnyxCredentialInfo,
  getTelnyxTelephonyCredentialId,
  getTelnyxFromPoolInfo,
  pickTelnyxFromNumber,
} from "@/lib/telnyx-call-control";

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const campaignIdFromBody = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const voipApiContext = parseVoipApiContext(body);
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

  if (isGlobalLeadPageVoipContext(voipApiContext) && !lead.campaignId) {
    return NextResponse.json(
      { error: "Leadet skal være tilknyttet en kampagne for at bruge VoIP (webhooks/aktivitet)." },
      { status: 409 },
    );
  }

  const mode = normalizeCampaignDialMode(lead.campaign?.dialMode);
  if (voipApiContext !== VOIP_API_CONTEXT.GLOBAL_LEAD_PAGE && !campaignUsesVoipUi(mode)) {
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

  // Per-agent credential (foretrukket — gør at bridge-flow kan ringe specifikt til denne agent
  // via sip:USERNAME@sip.telnyx.com). Falder tilbage til den globale env var hvis user'en
  // endnu ikke er provisioneret — men det betyder at flere agenter deler samme SIP-URI og
  // dispatcher-bridge vil ikke vide hvem den ringer til.
  const userRow = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { telnyxCredentialId: true, telnyxSipUsername: true },
  });
  const telephonyCredentialId =
    userRow?.telnyxCredentialId?.trim() || getTelnyxTelephonyCredentialId();
  const sharedFallback = !userRow?.telnyxCredentialId;
  if (!telephonyCredentialId) {
    return NextResponse.json(
      {
        code: "TELNYX_TELEPHONY_CREDENTIAL_MISSING",
        error:
          "Mangler Telnyx Telephony Credential. Bed admin om at provisionere VoIP for din konto via /administration/telnyx, eller sæt TELNYX_TELEPHONY_CREDENTIAL_ID i Vercel.",
      },
      { status: 503 },
    );
  }

  const fromPool = getTelnyxFromPoolInfo();
  const callerNumber = pickTelnyxFromNumber(leadId, { userId: session.user.id });
  if (!callerNumber) {
    return NextResponse.json(
      {
        code: "TELNYX_FROM_MISSING",
        error:
          "Sæt TELNYX_FROM_NUMBER eller TELNYX_FROM_NUMBERS (flere udgangsnumre som kommaseparerede E.164).",
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
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      telephonyCredentialId,
    );
    if (!uuidLike) {
      hints.push(
        `Credential-id ser ikke ud som et UUID (længde ${telephonyCredentialId.length}). Tjek TELNYX_TELEPHONY_CREDENTIAL_ID i Vercel.`,
      );
    }
    if (!info.found) {
      const fe = info.fetchError || "ukendt";
      if (/404|not.?found|ikke.?fundet/i.test(fe)) {
        hint =
          "Credential-id findes ikke på Telnyx-kontoen. Tjek at TELNYX_TELEPHONY_CREDENTIAL_ID og TELNYX_API_KEY hører til samme Telnyx-konto.";
      } else if (/401|unauth/i.test(fe)) {
        hint =
          "Telnyx 401: TELNYX_API_KEY er ugyldig eller udløbet. Opret en ny V2 API-nøgle i Telnyx portal og opdater Vercel.";
      } else if (/403|forbidden/i.test(fe)) {
        hint =
          "Telnyx 403: API-nøglen har ikke adgang til credential'et (ofte forkert konto/org).";
      } else if (/400/i.test(fe)) {
        hint =
          "Telnyx 400 på GET af credential: id-formatet er ugyldigt, eller credential'et hører til en anden konto.";
      } else {
        hint = `Kunne ikke hente credential fra Telnyx: ${fe}`;
      }
      hints.push(hint);
      hints.push(`GET-fejl: ${fe}`);
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
    /** Antal udgående numre i pool (1 = sæt TELNYX_FROM_NUMBERS med alle købte numre for fordeling). */
    fromNumberPoolSize: fromPool.size,
    fromNumberPoolSampleMasked: fromPool.sampleMasked,
    dialMode: mode,
    sipUsername: userRow?.telnyxSipUsername ?? null,
    sharedCredential: sharedFallback,
  });
}
