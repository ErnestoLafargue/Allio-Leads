import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { normalizeCampaignDialMode, campaignUsesVoipUi } from "@/lib/dial-mode";
import { LEAD_ACTIVITY_KIND, maskPhoneForActivity } from "@/lib/lead-activity-kinds";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import { dialTelnyxOutbound, getTelnyxConnectionId, pickTelnyxFromNumber } from "@/lib/telnyx-call-control";
import { encodeDialerClientState } from "@/lib/dialer-shared";
import { assertLeadMatchesActiveCampaignQueueOr403 } from "@/lib/active-campaign-queue";
import { isGlobalLeadPageVoipContext, parseVoipApiContext, VOIP_API_CONTEXT } from "@/lib/voip-api-context";

async function logCallAttempt(leadId: string, userId: string, summary: string) {
  try {
    await prisma.leadActivityEvent.create({
      data: { leadId, userId, kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT, summary },
    });
  } catch {
    /* aktivitet må ikke blokere opkaldssvar */
  }
}

/**
 * Starter udgående opkald mod et lead via Telnyx Call Control (POST /v2/calls).
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const toNumber = typeof body?.toNumber === "string" ? body.toNumber.trim() : "";
  const campaignIdFromBody =
    typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const voipApiContext = parseVoipApiContext(body);
  if (!leadId) {
    return NextResponse.json({ error: "leadId er påkrævet" }, { status: 400 });
  }
  if (!toNumber) {
    return NextResponse.json({ error: "Telefonnummer mangler" }, { status: 400 });
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
    return NextResponse.json(
      { error: "Lead hører ikke til den angivne kampagne." },
      { status: 403 },
    );
  }

  const toE164 = normalizePhoneToE164ForDial(toNumber);
  if (!toE164) {
    return NextResponse.json(
      { error: "Ugyldigt telefonnummer — brug E.164 eller 8 cifre (DK)." },
      { status: 400 },
    );
  }

  const masked = maskPhoneForActivity(toE164);
  const mode = normalizeCampaignDialMode(lead.campaign?.dialMode);
  if (voipApiContext !== VOIP_API_CONTEXT.GLOBAL_LEAD_PAGE) {
    if (!campaignUsesVoipUi(mode)) {
      await logCallAttempt(
        leadId,
        session.user.id,
        `Opkald til ${masked} ikke startet — kampagnen bruger ikke VoIP.`,
      );
      return NextResponse.json(
        { error: "Kampagnen er ikke sat til et opkalds-mode (VoIP)." },
        { status: 409 },
      );
    }
  }

  if (!sellerMayEditLead(session.user.role, session.user.id, lead)) {
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — leadet er låst af en anden bruger.`,
    );
    return NextResponse.json(
      { error: "Leadet er låst af en anden bruger — du kan ikke starte opkald." },
      { status: 409 },
    );
  }

  if (!isGlobalLeadPageVoipContext(voipApiContext)) {
    const queueGuard = await assertLeadMatchesActiveCampaignQueueOr403(prisma, leadId);
    if (!queueGuard.ok) {
      await logCallAttempt(leadId, session.user.id, `Opkald blokeret — ${queueGuard.error}`);
      return NextResponse.json({ error: queueGuard.error }, { status: 403 });
    }
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — Telnyx er ikke konfigureret.`,
    );
    return NextResponse.json(
      {
        ok: false,
        code: "TELNYX_NOT_CONFIGURED",
        message:
          "Telnyx er ikke konfigureret (mangler TELNYX_API_KEY). Sæt også TELNYX_CONNECTION_ID og TELNYX_FROM_NUMBER (eller TELNYX_FROM_NUMBERS).",
      },
      { status: 503 },
    );
  }

  const connectionId = getTelnyxConnectionId();
  if (!connectionId) {
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — mangler TELNYX_CONNECTION_ID.`,
    );
    return NextResponse.json(
      {
        ok: false,
        code: "TELNYX_CONNECTION_MISSING",
        message:
          "Mangler TELNYX_CONNECTION_ID (Call Control Application ID fra Telnyx-portalen).",
      },
      { status: 503 },
    );
  }

  const fromE164 = pickTelnyxFromNumber(leadId, { userId: session.user.id });
  if (!fromE164) {
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — mangler afsender-nummer (FROM).`,
    );
    return NextResponse.json(
      {
        ok: false,
        code: "TELNYX_FROM_MISSING",
        message:
          "Sæt TELNYX_FROM_NUMBER eller TELNYX_FROM_NUMBERS til ét af jeres Telnyx-numre (E.164, fx +4512345678).",
      },
      { status: 503 },
    );
  }

  if (!lead.campaignId) {
    return NextResponse.json(
      { error: "Lead er ikke tilknyttet en kampagne." },
      { status: 409 },
    );
  }

  // Brug delt clientState-format ("manual") så webhook'en kan korrelere events og
  // automatisk starte recording når lead besvarer. Inkluderer campaignId så
  // recording.saved-handler kan finde leadet og tilskrive aktiviteten korrekt agent.
  const clientState = encodeDialerClientState({
    v: 1,
    kind: "manual",
    campaignId: lead.campaignId,
    leadId,
    userId: session.user.id,
  });

  const webhookOverride = process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined;

  const dial = await dialTelnyxOutbound({
    connectionId,
    from: fromE164,
    to: toE164,
    apiKey,
    clientState,
    webhookUrl: webhookOverride,
  });

  if (!dial.ok) {
    const logStatus = dial.status >= 500 ? "Telnyx-serverfejl" : "Telnyx afviste opkaldet";
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — ${logStatus}: ${dial.message}`,
    );
    const status = dial.status === 422 || dial.status === 400 ? 400 : dial.status >= 500 ? 502 : 400;
    return NextResponse.json(
      {
        ok: false,
        code: "TELNYX_DIAL_FAILED",
        message: dial.message,
        dialMode: mode,
      },
      { status },
    );
  }

  await logCallAttempt(
    leadId,
    session.user.id,
    `Opkald startet til ${masked} (Telnyx ${dial.callControlId}).`,
  );

  return NextResponse.json({
    ok: true,
    callControlId: dial.callControlId,
    callSessionId: dial.callSessionId,
    dialMode: mode,
    from: fromE164,
    to: toE164,
  });
}
