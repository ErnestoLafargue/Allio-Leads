import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import {
  dialTelnyxOutbound,
  getTelnyxConnectionId,
  pickTelnyxFromNumber,
  type AmdConfig,
} from "@/lib/telnyx-call-control";
import { campaignUsesVoipUi, normalizeCampaignDialMode } from "@/lib/dial-mode";
import { encodeDialerClientState, PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";
import {
  DIALER_ABANDON_TARGET,
  MIN_PACING_SAMPLE_BEFORE_TUNE,
  PACING_WINDOW_MS,
  getTargetPacingRatioAndStats,
} from "@/lib/dialer-pacing";
import {
  computeDispatchNewCallsNeeded,
  MAX_IN_FLIGHT_PER_CAMPAIGN,
  parseTelnyxOutboundChannelLimitFromEnv,
} from "@/lib/dialer-dispatch-math";
import { claimDispatchLeadBatch } from "@/lib/power-dialer-batch";
import { userCanAccessCampaign } from "@/lib/campaign-access";
import { loadPowerCampaign, runPowerDispatch } from "@/lib/power-dialer-engine";

/**
 * Server-side parallel dialer.
 *
 * POWER_DIALER: udløses af den klare sælgers eget heartbeat. Pacing, AMD og ringetid læses fra
 * kampagnens Power-indstillinger (se `lib/power-dialer-engine.ts`); klientens body-parametre ignoreres.
 *
 * PREDICTIVE (kun ved manuelt kald — arbejdsfladen bruger WebRTC): dynamisk 1.0–3.0 ratio mod
 * DIALER_ABANDON_TARGET, `maxNewCalls` og `amd` fra body som før.
 */

const DEFAULT_PREDICTIVE_AMD: AmdConfig = {
  mode: "premium",
  totalAnalysisTimeMs: 5000,
  afterGreetingSilenceMs: 1000,
  greetingTotalAnalysisTimeMs: 4500,
};

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId er påkrævet" }, { status: 400 });
  }

  if (!(await userCanAccessCampaign(session!.user, campaignId))) {
    return NextResponse.json(
      { error: "Du har ikke adgang til denne kampagne." },
      { status: 403 },
    );
  }

  const campaignRow = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, dialMode: true },
  });
  if (!campaignRow) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }
  const mode = normalizeCampaignDialMode(campaignRow.dialMode);

  if (mode === "POWER_DIALER") {
    const campaign = await loadPowerCampaign(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
    }
    const result = await runPowerDispatch({ campaign, callerUserId: session!.user.id });
    if (result.code === "TELNYX_NOT_CONFIGURED") {
      return NextResponse.json(
        { ...result, error: "TELNYX_API_KEY eller TELNYX_CONNECTION_ID mangler." },
        { status: 503 },
      );
    }
    return NextResponse.json(result);
  }

  if (mode !== "PREDICTIVE") {
    return NextResponse.json(
      {
        error: campaignUsesVoipUi(mode)
          ? `dialMode=${mode} understøtter ikke server-side dispatch.`
          : "Kampagnen er ikke sat til et opkalds-mode (VoIP).",
      },
      { status: 409 },
    );
  }

  return predictiveDispatch({
    campaignId,
    userId: session!.user.id,
    maxNewCallsOverride:
      typeof body?.maxNewCalls === "number" && body.maxNewCalls > 0
        ? Math.min(Math.floor(body.maxNewCalls), 20)
        : null,
    amdMode: body?.amd === "off" || body?.amd === "detect" ? body.amd : "premium",
  });
}

async function predictiveDispatch(params: {
  campaignId: string;
  userId: string;
  maxNewCallsOverride: number | null;
  amdMode: "premium" | "detect" | "off";
}) {
  const { campaignId, maxNewCallsOverride, amdMode } = params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      dialMode: true,
      fieldConfig: true,
      activeQueueFilter: true,
      includeProtectedBusinesses: true,
      includeLeadsWithoutPhone: true,
      maxContactAttempts: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  const connectionId = getTelnyxConnectionId();
  if (!apiKey || !connectionId) {
    return NextResponse.json(
      {
        code: "TELNYX_NOT_CONFIGURED",
        error: "TELNYX_API_KEY eller TELNYX_CONNECTION_ID mangler.",
      },
      { status: 503 },
    );
  }

  const cutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  const readyAgents = await prisma.agentSession.findMany({
    where: {
      campaignId,
      status: "ready",
      lastHeartbeat: { gte: cutoff },
    },
    include: {
      user: { select: { telnyxSipUsername: true, telnyxCredentialId: true } },
    },
  });
  const readyCount = readyAgents.filter(
    (s) => s.user.telnyxSipUsername && s.user.telnyxCredentialId,
  ).length;

  const inFlightCalls = await prisma.dialerCallLog.count({
    where: {
      campaignId,
      direction: "outbound-lead",
      state: { in: ["initiated", "ringing", "answered"] },
      endedAt: null,
    },
  });

  const pacing = await getTargetPacingRatioAndStats(prisma, { campaignId, dialMode: "PREDICTIVE" });
  const channelLimit = parseTelnyxOutboundChannelLimitFromEnv(
    process.env.TELNYX_OUTBOUND_CHANNEL_LIMIT,
  );
  const pacingJson = (extras?: { targetTotal?: number }) => ({
    mode: "PREDICTIVE",
    targetAbandonRate: DIALER_ABANDON_TARGET,
    windowMs: PACING_WINDOW_MS,
    minSampleBeforeTune: MIN_PACING_SAMPLE_BEFORE_TUNE,
    ratio: pacing.ratio,
    abandonRate1h: pacing.abandonRate,
    sampleSize1h: pacing.sampleSize,
    bridges1h: pacing.bridgeCount,
    noAgentAbandons1h: pacing.noAgentAbandonCount,
    heldLowSample: pacing.heldLowSample,
    telnyxChannelLimit: channelLimit,
    ...(extras?.targetTotal !== undefined ? { targetTotal: extras.targetTotal } : {}),
  });

  if (readyCount === 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      attempted: 0,
      ready: 0,
      inFlight: inFlightCalls,
      reason: "Ingen ledige agenter (provisioneret + ready + frisk heartbeat).",
      pacing: pacingJson(),
    });
  }

  const { targetTotal, newCallsNeeded } = computeDispatchNewCallsNeeded({
    readyCount,
    ratio: pacing.ratio,
    inFlightCalls,
    maxInFlightCap: MAX_IN_FLIGHT_PER_CAMPAIGN,
    maxNewCallsOverride,
    channelLimit,
  });

  if (newCallsNeeded === 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      attempted: 0,
      ready: readyCount,
      inFlight: inFlightCalls,
      reason:
        channelLimit !== null && inFlightCalls >= channelLimit
          ? `Telnyx channel-limit nået (${inFlightCalls}/${channelLimit}) — ingen nye nu.`
          : `Allerede ${inFlightCalls}/${targetTotal} i luften — ingen nye nu.`,
      pacing: pacingJson({ targetTotal }),
    });
  }

  const reserved = await claimDispatchLeadBatch(prisma, {
    campaign,
    newCallsNeeded,
    restrictPowerDialerEligibleAfter: false,
  });

  if (reserved.length === 0) {
    return NextResponse.json({
      ok: true,
      dispatched: 0,
      attempted: 0,
      ready: readyCount,
      inFlight: inFlightCalls,
      reason: "Ingen flere ledige leads at dispatche (alle er allerede i kø, låst eller ugyldige numre).",
      pacing: pacingJson({ targetTotal }),
    });
  }

  const webhookUrl = process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined;
  const dispatchId = `disp_${Date.now()}_${params.userId.slice(-4)}`;

  const dialResults = await Promise.all(
    reserved.map(async (r) => {
      const fromE164 = pickTelnyxFromNumber(r.leadId, {
        userId: params.userId,
        extraSalt: dispatchId,
      });
      if (!fromE164) {
        return { leadId: r.leadId, ok: false as const, error: "TELNYX_FROM_NUMBER mangler" };
      }
      const clientState = encodeDialerClientState({
        v: 2,
        kind: "lead",
        campaignId,
        leadId: r.leadId,
        queueItemId: r.queueItemId,
        batchId: dispatchId,
        dialMode: "PREDICTIVE",
        phoneE164: r.e164,
      });
      const dial = await dialTelnyxOutbound({
        connectionId,
        from: fromE164,
        to: r.e164,
        apiKey,
        clientState,
        webhookUrl,
        amd: amdMode === "off" ? undefined : { ...DEFAULT_PREDICTIVE_AMD, mode: amdMode },
        timeoutSecs: 25,
      });
      if (!dial.ok) {
        return { leadId: r.leadId, ok: false as const, error: dial.message };
      }
      return {
        leadId: r.leadId,
        ok: true as const,
        callControlId: dial.callControlId,
        callSessionId: dial.callSessionId,
        from: fromE164,
        to: r.e164,
      };
    }),
  );

  const failures: { leadId: string; error: string }[] = [];
  let successes = 0;

  for (const r of dialResults) {
    if (r.ok) {
      successes += 1;
      await prisma
        .$transaction([
          prisma.dialerCallLog.upsert({
            where: { callControlId: r.callControlId },
            create: {
              campaignId,
              leadId: r.leadId,
              callControlId: r.callControlId,
              callSessionId: r.callSessionId ?? null,
              direction: "outbound-lead",
              state: "initiated",
              fromNumber: r.from,
              toNumber: r.to,
            },
            update: {
              campaignId,
              leadId: r.leadId,
              callSessionId: r.callSessionId ?? null,
              direction: "outbound-lead",
              fromNumber: r.from,
              toNumber: r.to,
            },
          }),
          prisma.dialerQueueItem.update({
            where: { leadId: r.leadId },
            data: { activeCallControlId: r.callControlId, attempts: { increment: 1 } },
          }),
        ])
        .catch((err) => {
          console.error("[dispatch] persist call log/queue failed", err);
        });
    } else {
      failures.push({ leadId: r.leadId, error: r.error });
      await prisma.dialerQueueItem.deleteMany({ where: { leadId: r.leadId } });
    }
  }

  return NextResponse.json({
    ok: true,
    dispatched: successes,
    attempted: reserved.length,
    failed: failures.length,
    ready: readyCount,
    inFlight: inFlightCalls + successes,
    target: targetTotal,
    dispatchId,
    errors: failures.length > 0 ? failures : undefined,
    pacing: pacingJson({ targetTotal }),
  });
}

/**
 * Cleanup udløbne queue-items (fx hvis webhook'en aldrig modtog en hangup pga server-restart).
 * Kan kaldes manuelt eller fra cron.
 */
export async function DELETE() {
  const { response } = await requireSession();
  if (response) return response;
  const now = new Date();
  const expired = await prisma.dialerQueueItem.deleteMany({
    where: { expiresAt: { lt: now }, connectedAt: null },
  });
  return NextResponse.json({ ok: true, cleaned: expired.count });
}

export const runtime = "nodejs";
export const maxDuration = 60;
