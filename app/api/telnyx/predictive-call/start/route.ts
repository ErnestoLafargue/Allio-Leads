import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { campaignUsesVoipUi, normalizeCampaignDialMode } from "@/lib/dial-mode";
import { LEAD_ACTIVITY_KIND, formatPhoneForActivitySummary } from "@/lib/lead-activity-kinds";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
import {
  type AmdConfig,
  dialTelnyxOutbound,
  getTelnyxConnectionId,
  pickTelnyxFromNumber,
} from "@/lib/telnyx-call-control";
import {
  encodeDialerClientState,
  QUEUE_RESERVATION_TTL_MS,
} from "@/lib/dialer-shared";
import { assertLeadMatchesActiveCampaignQueueOr403 } from "@/lib/active-campaign-queue";

/**
 * POST /api/telnyx/predictive-call/start
 *
 * Bruges af `CampaignVoipStrip` i PREDICTIVE-mode i stedet for det klient-side
 * `client.newCall()`. Vi placerer i stedet et server-side Telnyx Call Control-opkald
 * mod leadet med `answering_machine_detection: "premium"`. Voicemail-result fanges
 * af webhook-handleren (`call.machine.detection.ended`), som kalder
 * `handleAmdMachine` (sætter lead.status = VOICEMAIL) eller `handleAmdHuman`
 * (originate-bridge til en ledig agent på SIP-URI'en).
 *
 * Hvorfor: WebRTC SDK'en understøtter ikke AMD; client-side selv-dial kan derfor
 * ikke se forskel på voicemail og menneske, hvilket fører til at voicemails får
 * udfaldet NOT_HOME via 25-sek timeout. Med dette endpoint genbruger vi det
 * eksisterende parallel-dialer flow for det viste lead og får korrekt VOICEMAIL.
 *
 * Idempotens: `DialerQueueItem.leadId` er unique — samtidige requests for samme
 * lead afvises (fanget af catch). Den server-side parallel-dispatcher i
 * `/api/dialer/dispatch` ekskluderer leads med aktive queue-items, så vi
 * undgår double-dial.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const toNumberRaw = typeof body?.toNumber === "string" ? body.toNumber.trim() : "";
  const campaignIdFromBody =
    typeof body?.campaignId === "string" ? body.campaignId.trim() : "";

  if (!leadId) {
    return NextResponse.json({ error: "leadId er påkrævet" }, { status: 400 });
  }
  if (!toNumberRaw) {
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
  if (!lead.campaignId) {
    return NextResponse.json(
      { error: "Lead er ikke tilknyttet en kampagne." },
      { status: 409 },
    );
  }
  if (campaignIdFromBody && lead.campaignId !== campaignIdFromBody) {
    return NextResponse.json(
      { error: "Lead hører ikke til den angivne kampagne." },
      { status: 403 },
    );
  }

  const mode = normalizeCampaignDialMode(lead.campaign?.dialMode);
  if (mode !== "PREDICTIVE") {
    return NextResponse.json(
      {
        error: "Endpointet er kun beregnet til PREDICTIVE-kampagner.",
        dialMode: mode,
      },
      { status: 409 },
    );
  }
  if (!campaignUsesVoipUi(mode)) {
    return NextResponse.json(
      { error: "Kampagnen er ikke sat til et opkalds-mode (VoIP)." },
      { status: 409 },
    );
  }

  if (!sellerMayEditLead(session!.user.role, session!.user.id, lead)) {
    return NextResponse.json(
      { error: "Leadet er låst af en anden bruger — du kan ikke starte opkald." },
      { status: 409 },
    );
  }

  const queueGuard = await assertLeadMatchesActiveCampaignQueueOr403(prisma, leadId);
  if (!queueGuard.ok) {
    return NextResponse.json({ error: queueGuard.error }, { status: 403 });
  }

  const toE164 = normalizePhoneToE164ForDial(toNumberRaw);
  if (!toE164) {
    return NextResponse.json(
      { error: "Ugyldigt telefonnummer — brug E.164 eller 8 cifre (DK)." },
      { status: 400 },
    );
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
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
    return NextResponse.json(
      {
        ok: false,
        code: "TELNYX_CONNECTION_MISSING",
        message: "Mangler TELNYX_CONNECTION_ID.",
      },
      { status: 503 },
    );
  }

  const dispatchId = `pred_${Date.now()}_${session!.user.id.slice(-4)}`;
  const fromE164 = pickTelnyxFromNumber(leadId, {
    userId: session!.user.id,
    extraSalt: dispatchId,
  });
  if (!fromE164) {
    return NextResponse.json(
      {
        ok: false,
        code: "TELNYX_FROM_MISSING",
        message:
          "Sæt TELNYX_FROM_NUMBER eller TELNYX_FROM_NUMBERS til ét af jeres Telnyx-numre.",
      },
      { status: 503 },
    );
  }

  // Reservér leadet i køen FØR vi placerer opkaldet, så server-dispatcheren
  // ekskluderer det (den filtrerer på aktive DialerQueueItem). Det forhindrer
  // også at to predictive-strips fra samme agent dialer samme lead samtidigt.
  const expiresAt = new Date(Date.now() + QUEUE_RESERVATION_TTL_MS);
  try {
    await prisma.$transaction([
      prisma.dialerQueueItem.create({
        data: { campaignId: lead.campaignId, leadId, expiresAt },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: { lastDialAttemptAt: new Date() },
      }),
    ]);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "ALREADY_DIALING",
        error:
          "Leadet er allerede i predictive-køen — vent til det aktive opkald slutter før et nyt forsøg.",
      },
      { status: 409 },
    );
  }

  // Premium AMD — samme defaults som server-dispatcher (lib/dialer/dispatch).
  const amd: AmdConfig = {
    mode: "premium",
    totalAnalysisTimeMs: 3500,
    afterGreetingSilenceMs: 800,
    greetingTotalAnalysisTimeMs: 3500,
  };

  const clientState = encodeDialerClientState({
    v: 1,
    kind: "lead",
    campaignId: lead.campaignId,
    leadId,
    userId: session!.user.id,
    dispatchId,
  });

  const webhookUrl = process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined;

  const dial = await dialTelnyxOutbound({
    connectionId,
    from: fromE164,
    to: toE164,
    apiKey,
    clientState,
    webhookUrl,
    amd,
    timeoutSecs: 25,
  });

  if (!dial.ok) {
    // Frigør queue-reservationen så agenten kan prøve igen / dispatcheren kan tage leadet.
    await prisma.dialerQueueItem.deleteMany({ where: { leadId } }).catch(() => {});
    const phoneLabel = formatPhoneForActivitySummary(toE164);
    await prisma.leadActivityEvent
      .create({
        data: {
          leadId,
          userId: session!.user.id,
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          summary: `Predictive-opkald til ${phoneLabel} ikke startet — Telnyx: ${dial.message}`,
        },
      })
      .catch(() => {});
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

  // Race-beskyttelse: webhook'en kan have oprettet DialerCallLog allerede
  // (Telnyx fyrer call.initiated FØR vores HTTP-svar når igennem) — brug upsert
  // og opdater queue-item med callControlId så hangup-handleren kan rydde op.
  await prisma
    .$transaction([
      prisma.dialerCallLog.upsert({
        where: { callControlId: dial.callControlId },
        create: {
          campaignId: lead.campaignId,
          leadId,
          agentUserId: session!.user.id,
          callControlId: dial.callControlId,
          callSessionId: dial.callSessionId ?? null,
          direction: "outbound-lead",
          state: "initiated",
          fromNumber: fromE164,
          toNumber: toE164,
        },
        update: {
          campaignId: lead.campaignId,
          leadId,
          agentUserId: session!.user.id,
          callSessionId: dial.callSessionId ?? null,
          direction: "outbound-lead",
          fromNumber: fromE164,
          toNumber: toE164,
        },
      }),
      prisma.dialerQueueItem.update({
        where: { leadId },
        data: { activeCallControlId: dial.callControlId, attempts: { increment: 1 } },
      }),
    ])
    .catch((err) => {
      console.error("[predictive-call:start] persist call log/queue failed", err);
    });

  const phoneLabel = formatPhoneForActivitySummary(toE164);
  await prisma.leadActivityEvent
    .create({
      data: {
        leadId,
        userId: session!.user.id,
        kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
        summary: `Predictive-opkald (AMD) startet til ${phoneLabel} (Telnyx ${dial.callControlId}).`,
      },
    })
    .catch(() => {
      /* aktivitet må ikke blokere opkald */
    });

  return NextResponse.json({
    ok: true,
    callControlId: dial.callControlId,
    callSessionId: dial.callSessionId,
    dialMode: mode,
    from: fromE164,
    to: toE164,
    dispatchId,
  });
}

export const runtime = "nodejs";
