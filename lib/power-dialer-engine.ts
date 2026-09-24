/**
 * Power Dialer-motor (server): dispatch under kampagnelås, reservation af sælger, forbindelse
 * (Telnyx «Pattern 2»: lead-ben → ring sælgerens WebRTC op med bridge_on_answer), overskudsregel,
 * udfald på lead-ben og oprydning af forældede reservationer.
 *
 * Alle handlinger er idempotente via CAS-kolonner på DialerCallLog (bridgeRequestedAt, resolvedAt)
 * og Telnyx command_id, så dobbelte eller sene webhooks ikke giver dobbelte effekter.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encodeDialerClientState, PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";
import {
  dialTelnyxOutbound,
  getTelnyxConnectionId,
  hangupTelnyxCall,
  isTelnyxChannelLimitError,
  pickTelnyxFromNumber,
  startTelnyxRecording,
} from "@/lib/telnyx-call-control";
import {
  computeDropBrake,
  computePowerDispatchPlan,
  pickRingingLegsToCancel,
  type DropBrakeState,
  type PowerDispatchLimit,
} from "@/lib/dialer-dispatch-math";
import {
  POWER_DIALER_CAMPAIGN_SELECT,
  powerDialerSettingsFromCampaign,
  type PowerDialerSettings,
} from "@/lib/power-dialer-settings";
import {
  POWER_AGENT_LEG_TIMEOUT_SECS,
  POWER_AGENT_MAX_ATTEMPTS,
  POWER_AMD_TOTAL_ANALYSIS_MS,
  POWER_COOLDOWN_RESET_INTERVAL_MS,
  POWER_DROP_BRAKE_MIN_SAMPLE,
  POWER_DROP_BRAKE_WINDOW_MS,
  POWER_MAINTENANCE_INTERVAL_MS,
  POWER_MISSED_AGENT_BACKOFF_MS,
  POWER_RESERVATION_STALE_MS,
  POWER_STALE_LEG_EXTRA_MS,
  powerQueueReservationTtlMs,
} from "@/lib/power-dialer-constants";
import {
  classifyPowerLeadHangup,
  decidePowerAmdAction,
  POWER_DROP_RESOLUTIONS,
  type PowerResolution,
} from "@/lib/power-dialer-outcomes";
import type { AmdInternalResult } from "@/lib/telnyx-amd-result";
import { applyPowerLeadResolution } from "@/lib/power-dialer-lead-outcome";
import { claimPowerDialerLeads, listPowerDialerCandidates } from "@/lib/power-dialer-batch";
import { countPowerChannelsInUse, resolvePowerChannelLimit } from "@/lib/power-dialer-channels";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import { powerAgentSipUri } from "@/lib/telnyx-power-agent";
import { normalizeCampaignDialMode } from "@/lib/dial-mode";

type Db = PrismaClient | Prisma.TransactionClient;

export const POWER_CAMPAIGN_SELECT = {
  id: true,
  name: true,
  dialMode: true,
  fieldConfig: true,
  activeQueueFilter: true,
  includeProtectedBusinesses: true,
  includeLeadsWithoutPhone: true,
  maxContactAttempts: true,
  unansweredCooldownHours: true,
  ...POWER_DIALER_CAMPAIGN_SELECT,
} as const;

export type PowerCampaign = Prisma.CampaignGetPayload<{ select: typeof POWER_CAMPAIGN_SELECT }> & {
  settings: PowerDialerSettings;
};

export async function loadPowerCampaign(campaignId: string): Promise<PowerCampaign | null> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: POWER_CAMPAIGN_SELECT });
  if (!c) return null;
  return { ...c, settings: powerDialerSettingsFromCampaign(c) };
}

export function isPowerCampaign(c: { dialMode: string | null } | null | undefined): boolean {
  return normalizeCampaignDialMode(c?.dialMode) === "POWER_DIALER";
}

function telnyxApiKey(): string | null {
  return process.env.TELNYX_API_KEY?.trim() || null;
}

function freshCutoff(now: Date): Date {
  return new Date(now.getTime() - PRESENCE_FRESH_WINDOW_MS);
}

/** Sælgere dispatch må ringe op for: klar, WebRTC klar, frisk heartbeat, ikke i efterbehandling. */
export function dialableAgentWhere(campaignId: string, now: Date): Prisma.AgentSessionWhereInput {
  return {
    campaignId,
    status: "ready",
    webrtcReady: true,
    lastHeartbeat: { gte: freshCutoff(now) },
    OR: [{ wrapUpUntil: null }, { wrapUpUntil: { lte: now } }],
  };
}

export async function countDialableAgents(db: Db, campaignId: string, now: Date): Promise<number> {
  return db.agentSession.count({ where: dialableAgentWhere(campaignId, now) });
}

export async function getPowerDropStats(
  db: Db,
  campaignId: string,
  now: Date,
): Promise<{ bridges: number; drops: number }> {
  const since = new Date(now.getTime() - POWER_DROP_BRAKE_WINDOW_MS);
  const [bridges, drops] = await Promise.all([
    db.dialerCallLog.count({
      where: { campaignId, direction: "outbound-lead", bridgedAt: { gte: since } },
    }),
    db.dialerCallLog.count({
      where: {
        campaignId,
        direction: "outbound-lead",
        resolution: { in: [...POWER_DROP_RESOLUTIONS] },
        resolvedAt: { gte: since },
      },
    }),
  ]);
  return { bridges, drops };
}

export async function getPowerDropBrake(
  db: Db,
  campaignId: string,
  settings: PowerDialerSettings,
  now: Date,
): Promise<DropBrakeState> {
  const stats = await getPowerDropStats(db, campaignId, now);
  return computeDropBrake({
    ...stats,
    maxDropRatePct: settings.maxDropRatePct,
    minSample: POWER_DROP_BRAKE_MIN_SAMPLE,
  });
}

type InFlightRow = { cc: string | null; reservedAt: Date; answeredAt: Date | null };

/**
 * Kampagnens lead-opkald uden tildelt sælger: reserveret (ikke ringet op endnu), ringer eller
 * besvaret mens AMD kører. `ringing` er dem der kan lægges på (ringet op, ikke besvaret).
 */
export async function loadUnassignedInFlight(
  db: Db,
  campaignId: string,
  now: Date,
): Promise<{ unassigned: number; ringing: { callControlId: string; reservedAt: Date }[] }> {
  const rows = await db.$queryRaw<InFlightRow[]>`
    SELECT q."activeCallControlId" AS "cc", q."reservedAt" AS "reservedAt", l."answeredAt" AS "answeredAt"
    FROM "DialerQueueItem" q
    LEFT JOIN "DialerCallLog" l ON l."callControlId" = q."activeCallControlId"
    WHERE q."campaignId" = ${campaignId}
      AND q."connectedAt" IS NULL
      AND q."expiresAt" > ${now}
      AND (l."id" IS NULL OR (l."endedAt" IS NULL AND l."resolvedAt" IS NULL AND l."bridgeRequestedAt" IS NULL))`;
  const ringing = rows
    .filter((r) => r.cc && !r.answeredAt)
    .map((r) => ({ callControlId: r.cc as string, reservedAt: new Date(r.reservedAt) }));
  return { unassigned: rows.length, ringing };
}

// ---------------------------------------------------------------------------
// Udfald på lead-ben
// ---------------------------------------------------------------------------

/**
 * Afgør et lead-ben én gang (CAS på resolvedAt): læg evt. på, frigiv kø-reservationen og skriv
 * effekten på leadet. Returnerer false hvis benet allerede var afgjort.
 */
export async function resolvePowerLeadLeg(params: {
  callControlId: string;
  resolution: PowerResolution;
  hangup: boolean;
  queueItemId?: string | null;
  campaign?: PowerCampaign | null;
}): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.dialerCallLog.updateMany({
    where: { callControlId: params.callControlId, resolvedAt: null },
    data: { resolvedAt: now, resolution: params.resolution },
  });
  if (claimed.count !== 1) return false;

  const leg = await prisma.dialerCallLog.findUnique({
    where: { callControlId: params.callControlId },
    select: { campaignId: true, leadId: true },
  });
  if (params.hangup) {
    const apiKey = telnyxApiKey();
    if (apiKey) {
      await hangupTelnyxCall({
        apiKey,
        callControlId: params.callControlId,
        commandId: `power-hangup-${params.callControlId}`,
      }).catch(() => undefined);
    }
  }
  if (!leg?.leadId) return true;

  if (params.resolution !== "CONNECTED") {
    await prisma.dialerQueueItem.deleteMany({
      where: {
        leadId: leg.leadId,
        OR: [
          { activeCallControlId: params.callControlId },
          ...(params.queueItemId ? [{ id: params.queueItemId }] : []),
        ],
      },
    });
  }
  const campaign = params.campaign ?? (await loadPowerCampaign(leg.campaignId));
  if (campaign) {
    await applyPowerLeadResolution({
      leadId: leg.leadId,
      resolution: params.resolution,
      settings: campaign.settings,
      unansweredCooldownHours: campaign.unansweredCooldownHours,
      now,
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sælger-reservation
// ---------------------------------------------------------------------------

export type ReservedPowerAgent = { sessionId: string; userId: string; sipUri: string };

/** Reservér den længst ledige klare sælger (eller en der drainer) atomisk. */
export async function reservePowerAgent(params: {
  campaignId: string;
  leadId: string;
  leadCallControlId: string;
  excludeUserIds: string[];
  now: Date;
}): Promise<ReservedPowerAgent | null> {
  const { campaignId, now } = params;
  const candidates = await prisma.agentSession.findMany({
    where: {
      campaignId,
      webrtcReady: true,
      lastHeartbeat: { gte: freshCutoff(now) },
      ...(params.excludeUserIds.length > 0 ? { userId: { notIn: params.excludeUserIds } } : {}),
      OR: [
        { status: "ready", OR: [{ wrapUpUntil: null }, { wrapUpUntil: { lte: now } }] },
        { status: "draining", drainUntil: { gt: now } },
      ],
    },
    orderBy: [{ readySince: { sort: "asc", nulls: "last" } }, { lastHeartbeat: "asc" }],
    take: 10,
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { telnyxCredentialSipUsername: true, telnyxSipUsername: true } },
    },
  });
  for (const s of candidates) {
    const sipUri = powerAgentSipUri(s.user);
    if (!sipUri) continue;
    const upd = await prisma.agentSession.updateMany({
      where: { id: s.id, status: s.status },
      data: {
        status: "ringing",
        reservedAt: now,
        currentLeadId: params.leadId,
        currentLeadCallControlId: params.leadCallControlId,
        currentAgentCallControlId: null,
      },
    });
    if (upd.count === 1) return { sessionId: s.id, userId: s.userId, sipUri };
  }
  return null;
}

/**
 * Frigiv en reservation, når sælgeren aldrig blev forbundet med leadet (også hvis agent-benet nåede
 * at blive besvaret før leadet forsvandt). Drainende sælgere forbliver drainende.
 */
export async function releasePowerAgentReservation(
  where: { sessionId: string } | { agentCallControlId: string } | { leadCallControlId: string },
  opts: { backoffMs?: number } = {},
): Promise<void> {
  const now = new Date();
  const filter: Prisma.AgentSessionWhereInput =
    "sessionId" in where
      ? { id: where.sessionId }
      : "agentCallControlId" in where
        ? { currentAgentCallControlId: where.agentCallControlId }
        : { currentLeadCallControlId: where.leadCallControlId };
  const sessions = await prisma.agentSession.findMany({
    where: { ...filter, status: { in: ["ringing", "talking"] } },
    select: { id: true, status: true, drainUntil: true },
  });
  for (const s of sessions) {
    const draining = s.drainUntil !== null && s.drainUntil.getTime() > now.getTime();
    await prisma.agentSession.updateMany({
      where: { id: s.id, status: s.status },
      data: {
        status: draining ? "draining" : "ready",
        reservedAt: null,
        currentLeadId: null,
        currentLeadCallControlId: null,
        currentAgentCallControlId: null,
        ...(opts.backoffMs ? { wrapUpUntil: new Date(now.getTime() + opts.backoffMs) } : {}),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Forbind menneske → sælger
// ---------------------------------------------------------------------------

export type PowerConnectOutcome = "connecting" | "dropped" | "skipped";

/**
 * Forbind et besvaret lead-ben til den længst ledige sælger: ring sælgerens WebRTC op med
 * link_to + bridge_on_answer. Første forsøg kræver at ingen andre er i gang (CAS på
 * bridgeRequestedAt); retry kun fra agent-benets hangup (CAS på agentAttempts).
 */
export async function connectPowerLeadToAgent(params: {
  leadCallControlId: string;
  retry?: { expectedAttempts: number; excludeUserIds: string[] };
}): Promise<PowerConnectOutcome> {
  const apiKey = telnyxApiKey();
  const connectionId = getTelnyxConnectionId();
  const now = new Date();
  const leg = await prisma.dialerCallLog.findUnique({
    where: { callControlId: params.leadCallControlId },
    select: {
      campaignId: true,
      leadId: true,
      endedAt: true,
      bridgedAt: true,
      resolvedAt: true,
      bridgeRequestedAt: true,
      agentAttempts: true,
      fromNumber: true,
    },
  });
  if (!leg?.leadId || leg.endedAt || leg.bridgedAt || leg.resolvedAt) return "skipped";

  if (params.retry) {
    if (leg.agentAttempts !== params.retry.expectedAttempts) return "skipped";
    if (leg.agentAttempts >= POWER_AGENT_MAX_ATTEMPTS) {
      await resolvePowerLeadLeg({
        callControlId: params.leadCallControlId,
        resolution: "DROP_NO_AGENT",
        hangup: true,
      });
      return "dropped";
    }
    const claim = await prisma.dialerCallLog.updateMany({
      where: {
        callControlId: params.leadCallControlId,
        endedAt: null,
        bridgedAt: null,
        resolvedAt: null,
        agentAttempts: params.retry.expectedAttempts,
      },
      data: { bridgeRequestedAt: now, agentAttempts: { increment: 1 }, state: "human" },
    });
    if (claim.count !== 1) return "skipped";
  } else {
    const claim = await prisma.dialerCallLog.updateMany({
      where: {
        callControlId: params.leadCallControlId,
        endedAt: null,
        bridgedAt: null,
        resolvedAt: null,
        bridgeRequestedAt: null,
      },
      data: { bridgeRequestedAt: now, agentAttempts: { increment: 1 }, state: "human" },
    });
    if (claim.count !== 1) return "skipped";
  }

  const campaign = await loadPowerCampaign(leg.campaignId);
  if (!campaign || !apiKey || !connectionId) {
    await resolvePowerLeadLeg({
      callControlId: params.leadCallControlId,
      resolution: "DROP_NO_AGENT",
      hangup: true,
      campaign,
    });
    return "dropped";
  }

  const excluded = params.retry?.excludeUserIds ?? [];
  const agent = await reservePowerAgent({
    campaignId: leg.campaignId,
    leadId: leg.leadId,
    leadCallControlId: params.leadCallControlId,
    excludeUserIds: excluded,
    now,
  });
  if (!agent) {
    await resolvePowerLeadLeg({
      callControlId: params.leadCallControlId,
      resolution: "DROP_NO_AGENT",
      hangup: true,
      campaign,
    });
    return "dropped";
  }

  const attempt = leg.agentAttempts + 1;
  const fromNumber =
    leg.fromNumber?.trim() || pickTelnyxFromNumber(leg.leadId, { userId: agent.userId }) || "";
  const dial = await dialTelnyxOutbound({
    connectionId,
    apiKey,
    from: fromNumber,
    to: agent.sipUri,
    clientState: encodeDialerClientState({
      v: 1,
      kind: "agent",
      campaignId: leg.campaignId,
      leadId: leg.leadId,
      userId: agent.userId,
      linkedCallControlId: params.leadCallControlId,
      dialMode: "POWER_DIALER",
    }),
    webhookUrl: process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined,
    linkTo: params.leadCallControlId,
    bridgeIntent: true,
    bridgeOnAnswer: true,
    preventDoubleBridge: true,
    timeoutSecs: POWER_AGENT_LEG_TIMEOUT_SECS,
    commandId: `power-agent-${params.leadCallControlId}-${attempt}`,
  });

  if (!dial.ok) {
    console.error("[power-dialer] agent-ben kunne ikke ringes op", {
      campaignId: leg.campaignId,
      attempt,
      channelLimit: isTelnyxChannelLimitError(dial.message),
      message: dial.message.slice(0, 160),
    });
    await releasePowerAgentReservation({ sessionId: agent.sessionId });
    if (attempt < POWER_AGENT_MAX_ATTEMPTS) {
      return connectPowerLeadToAgent({
        leadCallControlId: params.leadCallControlId,
        retry: { expectedAttempts: attempt, excludeUserIds: [...excluded, agent.userId] },
      });
    }
    await resolvePowerLeadLeg({
      callControlId: params.leadCallControlId,
      resolution: "DROP_NO_AGENT",
      hangup: true,
      campaign,
    });
    return "dropped";
  }

  await prisma.$transaction([
    prisma.agentSession.updateMany({
      where: { id: agent.sessionId, status: "ringing", currentLeadCallControlId: params.leadCallControlId },
      data: { currentAgentCallControlId: dial.callControlId },
    }),
    prisma.dialerCallLog.createMany({
      data: [
        {
          campaignId: leg.campaignId,
          leadId: leg.leadId,
          agentUserId: agent.userId,
          callControlId: dial.callControlId,
          callSessionId: dial.callSessionId ?? null,
          direction: "outbound-agent",
          state: "initiated",
          bridgeTargetId: params.leadCallControlId,
          toNumber: agent.sipUri,
        },
      ],
      skipDuplicates: true,
    }),
    prisma.dialerCallLog.updateMany({
      where: { callControlId: dial.callControlId },
      data: { agentUserId: agent.userId, bridgeTargetId: params.leadCallControlId, leadId: leg.leadId },
    }),
    prisma.dialerCallLog.updateMany({
      where: { callControlId: params.leadCallControlId },
      data: { agentUserId: agent.userId, bridgeTargetId: dial.callControlId },
    }),
  ]);

  // Hvis leadet lagde på, mens vi ringede sælgeren op, skal agent-benet ikke leve videre.
  const after = await prisma.dialerCallLog.findUnique({
    where: { callControlId: params.leadCallControlId },
    select: { endedAt: true },
  });
  if (after?.endedAt) {
    await hangupTelnyxCall({
      apiKey,
      callControlId: dial.callControlId,
      commandId: `power-hangup-${dial.callControlId}`,
    }).catch(() => undefined);
    await releasePowerAgentReservation({ sessionId: agent.sessionId });
    return "skipped";
  }

  await enforcePowerCapacity(leg.campaignId, campaign);
  return "connecting";
}

// ---------------------------------------------------------------------------
// Overskudsregel
// ---------------------------------------------------------------------------

/**
 * Er der flere ringende opkald end de klare sælgere kan tage, lægges de ældste ringende på —
 * før nogen svarer — i stedet for at risikere et menneske uden sælger.
 */
export async function enforcePowerCapacity(
  campaignId: string,
  campaign?: PowerCampaign | null,
): Promise<number> {
  const c = campaign ?? (await loadPowerCampaign(campaignId));
  if (!c) return 0;
  const now = new Date();
  const [ready, inFlight, brake] = await Promise.all([
    countDialableAgents(prisma, campaignId, now),
    loadUnassignedInFlight(prisma, campaignId, now),
    getPowerDropBrake(prisma, campaignId, c.settings, now),
  ]);
  const plan = computePowerDispatchPlan({
    readyAgents: ready,
    ratio: c.settings.dialRatio,
    brakeActive: brake.active,
    maxInFlight: c.settings.maxInFlight,
    unassignedInFlight: inFlight.unassigned,
    ringingUnanswered: inFlight.ringing.length,
    channelLimit: null,
    channelsInUse: 0,
  });
  const toCancel = pickRingingLegsToCancel(inFlight.ringing, plan.cancelRinging);
  let cancelled = 0;
  for (const leg of toCancel) {
    const done = await resolvePowerLeadLeg({
      callControlId: leg.callControlId,
      resolution: "CANCELLED_OVERDIAL",
      hangup: true,
      campaign: c,
    });
    if (done) cancelled += 1;
  }
  return cancelled;
}

// ---------------------------------------------------------------------------
// Webhook-hændelser (kaldes fra call-events via after())
// ---------------------------------------------------------------------------

export async function handlePowerLeadAnswered(leadCallControlId: string): Promise<void> {
  const now = new Date();
  await prisma.dialerCallLog.updateMany({
    where: { callControlId: leadCallControlId, endedAt: null, answeredAt: null },
    data: { state: "answered", answeredAt: now },
  });
  const leg = await prisma.dialerCallLog.findUnique({
    where: { callControlId: leadCallControlId },
    select: { campaignId: true },
  });
  if (!leg) return;
  const campaign = await loadPowerCampaign(leg.campaignId);
  if (campaign && !campaign.settings.amdEnabled) {
    await connectPowerLeadToAgent({ leadCallControlId });
  }
}

export async function handlePowerLeadAmd(
  leadCallControlId: string,
  amd: AmdInternalResult,
  kind: "detection" | "greeting",
): Promise<void> {
  await prisma.dialerCallLog.updateMany({
    where: { callControlId: leadCallControlId },
    data: { amdResult: amd },
  });
  const leg = await prisma.dialerCallLog.findUnique({
    where: { callControlId: leadCallControlId },
    select: { campaignId: true, bridgeRequestedAt: true, bridgedAt: true, resolvedAt: true, endedAt: true },
  });
  if (!leg || leg.resolvedAt || leg.bridgedAt) return;
  const campaign = await loadPowerCampaign(leg.campaignId);
  if (!campaign) return;

  if (kind === "greeting") {
    // Beep efter en afgørelse ignoreres — det må aldrig lægge en igangværende samtale på.
    if (leg.bridgeRequestedAt || amd !== "machine") return;
    await resolvePowerLeadLeg({ callControlId: leadCallControlId, resolution: "VOICEMAIL", hangup: true, campaign });
    return;
  }

  const action = decidePowerAmdAction(amd, campaign.settings.amdUncertainAction);
  if (action === "CONNECT") {
    if (leg.endedAt) return;
    await connectPowerLeadToAgent({ leadCallControlId });
    return;
  }
  await resolvePowerLeadLeg({
    callControlId: leadCallControlId,
    resolution: action === "VOICEMAIL" ? "VOICEMAIL" : "AMD_UNCERTAIN_REQUEUE",
    hangup: true,
    campaign,
  });
}

export async function handlePowerLegBridged(callControlId: string, direction: "lead" | "agent"): Promise<void> {
  const now = new Date();
  const won = await prisma.dialerCallLog.updateMany({
    where: { callControlId, bridgedAt: null },
    data: { state: "bridged", bridgedAt: now },
  });
  if (direction === "agent") {
    await prisma.agentSession.updateMany({
      where: { currentAgentCallControlId: callControlId, status: { in: ["ringing", "talking"] } },
      data: { status: "talking", reservedAt: null },
    });
    return;
  }
  const leg = await prisma.dialerCallLog.findUnique({
    where: { callControlId },
    select: { leadId: true },
  });
  await prisma.dialerCallLog.updateMany({
    where: { callControlId, resolvedAt: null },
    data: { resolvedAt: now, resolution: "CONNECTED" },
  });
  if (leg?.leadId) {
    await prisma.dialerQueueItem.updateMany({
      where: { leadId: leg.leadId, activeCallControlId: callControlId },
      data: { connectedAt: now },
    });
  }
  await prisma.agentSession.updateMany({
    where: { currentLeadCallControlId: callControlId, status: { in: ["ringing", "talking"] } },
    data: { status: "talking", reservedAt: null },
  });
  const apiKey = telnyxApiKey();
  if (won.count === 1 && apiKey) {
    const rec = await startTelnyxRecording({
      apiKey,
      callControlId,
      format: "mp3",
      channels: "dual",
      commandId: `power-record-${callControlId}`,
    }).catch(() => null);
    if (rec && !rec.ok) console.error("[power-dialer] record_start fejlede:", rec.message);
  }
}

export async function handlePowerLeadEnded(params: {
  leadCallControlId: string;
  hangupCause: string | null;
  hangupSource: string | null;
  sipHangupCause: string | null;
  queueItemId: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.dialerCallLog.updateMany({
    where: { callControlId: params.leadCallControlId, endedAt: null },
    data: {
      state: "hangup",
      endedAt: now,
      hangupCause: params.hangupCause,
      hangupSource: params.hangupSource,
    },
  });
  const leg = await prisma.dialerCallLog.findUnique({
    where: { callControlId: params.leadCallControlId },
    select: {
      campaignId: true,
      leadId: true,
      answeredAt: true,
      bridgedAt: true,
      resolvedAt: true,
      bridgeTargetId: true,
    },
  });
  if (!leg) return;

  if (leg.leadId) {
    await prisma.dialerQueueItem.deleteMany({
      where: {
        leadId: leg.leadId,
        OR: [
          { activeCallControlId: params.leadCallControlId },
          ...(params.queueItemId ? [{ id: params.queueItemId }] : []),
        ],
      },
    });
  }

  if (leg.bridgedAt) {
    await prisma.agentSession.updateMany({
      where: { currentLeadCallControlId: params.leadCallControlId, status: { in: ["ringing", "talking"] } },
      data: {
        status: "wrap_up",
        wrapUpUntil: null,
        reservedAt: null,
        currentLeadCallControlId: null,
        currentAgentCallControlId: null,
      },
    });
  } else if (leg.bridgeTargetId) {
    // Leadet lagde på, mens sælgeren blev ringet op: læg agent-benet på og frigiv sælgeren.
    const agentLeg = await prisma.dialerCallLog.findUnique({
      where: { callControlId: leg.bridgeTargetId },
      select: { endedAt: true },
    });
    const apiKey = telnyxApiKey();
    if (agentLeg && !agentLeg.endedAt && apiKey) {
      await hangupTelnyxCall({
        apiKey,
        callControlId: leg.bridgeTargetId,
        commandId: `power-hangup-${leg.bridgeTargetId}`,
      }).catch(() => undefined);
    }
    await releasePowerAgentReservation({ leadCallControlId: params.leadCallControlId });
  }

  if (!leg.resolvedAt) {
    const resolution = classifyPowerLeadHangup({
      hangupCause: params.hangupCause,
      sipHangupCause: params.sipHangupCause,
      answered: Boolean(leg.answeredAt),
      bridged: Boolean(leg.bridgedAt),
    });
    await resolvePowerLeadLeg({
      callControlId: params.leadCallControlId,
      resolution,
      hangup: false,
      queueItemId: params.queueItemId,
    });
  }
}

export async function handlePowerAgentAnswered(agentCallControlId: string): Promise<void> {
  const now = new Date();
  await prisma.dialerCallLog.updateMany({
    where: { callControlId: agentCallControlId, endedAt: null, answeredAt: null },
    data: { state: "answered", answeredAt: now },
  });
  await prisma.agentSession.updateMany({
    where: { currentAgentCallControlId: agentCallControlId, status: "ringing" },
    data: { status: "talking", reservedAt: null },
  });
}

export async function handlePowerAgentEnded(params: {
  agentCallControlId: string;
  hangupCause: string | null;
  hangupSource: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.dialerCallLog.updateMany({
    where: { callControlId: params.agentCallControlId, endedAt: null },
    data: {
      state: "hangup",
      endedAt: now,
      hangupCause: params.hangupCause,
      hangupSource: params.hangupSource,
    },
  });
  const agentLeg = await prisma.dialerCallLog.findUnique({
    where: { callControlId: params.agentCallControlId },
    select: { agentUserId: true, bridgeTargetId: true, answeredAt: true, bridgedAt: true },
  });
  if (!agentLeg) return;
  const leadLeg = agentLeg.bridgeTargetId
    ? await prisma.dialerCallLog.findUnique({
        where: { callControlId: agentLeg.bridgeTargetId },
        select: { endedAt: true, bridgedAt: true, resolvedAt: true, agentAttempts: true },
      })
    : null;

  if (agentLeg.bridgedAt || leadLeg?.bridgedAt) {
    // Samtalen er slut: efterbehandling indtil sælgeren har gemt leadet.
    await prisma.agentSession.updateMany({
      where: { currentAgentCallControlId: params.agentCallControlId },
      data: {
        status: "wrap_up",
        wrapUpUntil: null,
        reservedAt: null,
        currentLeadCallControlId: null,
        currentAgentCallControlId: null,
      },
    });
    return;
  }

  // Sælgeren blev aldrig forbundet (timeout, afvist, ikke registreret).
  await releasePowerAgentReservation(
    { agentCallControlId: params.agentCallControlId },
    { backoffMs: agentLeg.answeredAt ? 0 : POWER_MISSED_AGENT_BACKOFF_MS },
  );
  if (agentLeg.bridgeTargetId && leadLeg && !leadLeg.endedAt && !leadLeg.resolvedAt) {
    await connectPowerLeadToAgent({
      leadCallControlId: agentLeg.bridgeTargetId,
      retry: {
        expectedAttempts: leadLeg.agentAttempts,
        excludeUserIds: agentLeg.agentUserId ? [agentLeg.agentUserId] : [],
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Oprydning (throttlet pr. instans)
// ---------------------------------------------------------------------------

const lastMaintenanceAt = new Map<string, number>();
let lastCooldownResetAt = 0;

export async function runPowerMaintenance(
  campaign: PowerCampaign,
  opts: { force?: boolean } = {},
): Promise<void> {
  const nowMs = Date.now();
  if (nowMs - lastCooldownResetAt >= POWER_COOLDOWN_RESET_INTERVAL_MS) {
    lastCooldownResetAt = nowMs;
    await applyLeadCooldownResets().catch((err) => {
      console.error("[power-dialer] cooldown-reset fejlede:", err);
    });
  }
  const last = lastMaintenanceAt.get(campaign.id) ?? 0;
  if (!opts.force && nowMs - last < POWER_MAINTENANCE_INTERVAL_MS) return;
  lastMaintenanceAt.set(campaign.id, nowMs);

  const now = new Date(nowMs);
  const apiKey = telnyxApiKey();

  // 1) Udløbne kø-reservationer uden forbindelse: læg evt. levende ben på og frigiv leadet.
  const expired = await prisma.dialerQueueItem.findMany({
    where: { campaignId: campaign.id, connectedAt: null, expiresAt: { lt: now } },
    select: { id: true, leadId: true, activeCallControlId: true },
  });
  for (const q of expired) {
    if (q.activeCallControlId) {
      const leg = await prisma.dialerCallLog.findUnique({
        where: { callControlId: q.activeCallControlId },
        select: { endedAt: true, resolvedAt: true, bridgeRequestedAt: true },
      });
      if (leg && !leg.endedAt) {
        if (apiKey) {
          await hangupTelnyxCall({
            apiKey,
            callControlId: q.activeCallControlId,
            commandId: `power-hangup-${q.activeCallControlId}`,
          }).catch(() => undefined);
        }
        await prisma.dialerCallLog.updateMany({
          where: { callControlId: q.activeCallControlId, endedAt: null },
          data: { state: "hangup", endedAt: now, hangupCause: "power_reaped" },
        });
      }
      if (leg && !leg.resolvedAt) {
        await resolvePowerLeadLeg({
          callControlId: q.activeCallControlId,
          resolution: leg.bridgeRequestedAt ? "DROP_NO_AGENT" : "TECHNICAL",
          hangup: false,
          queueItemId: q.id,
          campaign,
        });
      }
    }
    await prisma.dialerQueueItem.deleteMany({ where: { id: q.id, connectedAt: null } });
  }

  // 2) Forbundne reservationer hvor samtalen er slut.
  await prisma.$executeRaw`
    DELETE FROM "DialerQueueItem" q
    USING "DialerCallLog" l
    WHERE q."campaignId" = ${campaign.id}
      AND q."connectedAt" IS NOT NULL
      AND l."callControlId" = q."activeCallControlId"
      AND l."endedAt" IS NOT NULL`;

  // 3) Uforbundne lead-ben uden events og uden reservation (fx tabte hangup-webhooks).
  const staleBefore = new Date(nowMs - campaign.settings.ringTimeoutSecs * 1000 - POWER_STALE_LEG_EXTRA_MS);
  await prisma.$executeRaw`
    UPDATE "DialerCallLog" l
    SET "state" = 'hangup', "endedAt" = ${now}, "hangupCause" = COALESCE(l."hangupCause", 'power_stale')
    WHERE l."campaignId" = ${campaign.id}
      AND l."direction" = 'outbound-lead'
      AND l."endedAt" IS NULL
      AND l."bridgedAt" IS NULL
      AND l."startedAt" < ${staleBefore}
      AND NOT EXISTS (SELECT 1 FROM "DialerQueueItem" q WHERE q."activeCallControlId" = l."callControlId")`;

  // 4) Agent-ben der aldrig blev besvaret.
  await prisma.dialerCallLog.updateMany({
    where: {
      campaignId: campaign.id,
      direction: "outbound-agent",
      endedAt: null,
      answeredAt: null,
      startedAt: { lt: new Date(nowMs - 60_000) },
    },
    data: { state: "hangup", endedAt: now, hangupCause: "power_stale" },
  });

  // 5) Reservationer uden levende agent-ben frigives; samtaler hvor agent-benet er slut → efterbehandling.
  const reserved = await prisma.agentSession.findMany({
    where: {
      campaignId: campaign.id,
      status: { in: ["ringing", "talking"] },
    },
    select: { id: true, status: true, reservedAt: true, currentAgentCallControlId: true },
  });
  for (const s of reserved) {
    const agentLeg = s.currentAgentCallControlId
      ? await prisma.dialerCallLog.findUnique({
          where: { callControlId: s.currentAgentCallControlId },
          select: { endedAt: true, answeredAt: true },
        })
      : null;
    if (s.status === "ringing") {
      const stale = !s.reservedAt || nowMs - s.reservedAt.getTime() > POWER_RESERVATION_STALE_MS;
      if (!stale) continue;
      if (agentLeg?.answeredAt && !agentLeg.endedAt) {
        await prisma.agentSession.updateMany({
          where: { id: s.id, status: "ringing" },
          data: { status: "talking", reservedAt: null },
        });
      } else {
        await releasePowerAgentReservation({ sessionId: s.id });
      }
    } else if (s.currentAgentCallControlId && agentLeg?.endedAt) {
      await prisma.agentSession.updateMany({
        where: { id: s.id, status: "talking" },
        data: {
          status: "wrap_up",
          wrapUpUntil: null,
          currentLeadCallControlId: null,
          currentAgentCallControlId: null,
        },
      });
    }
  }

  // 6) Sessioner uden heartbeat i et døgn.
  await prisma.agentSession.deleteMany({
    where: { campaignId: campaign.id, lastHeartbeat: { lt: new Date(nowMs - 24 * 60 * 60 * 1000) } },
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export type PowerDispatchCode =
  | "DIALED"
  | "AT_CAPACITY"
  | "CHANNEL_LIMIT"
  | "QUEUE_EMPTY"
  | "NO_READY_AGENTS"
  | "CALLER_NOT_READY"
  | "BUSY"
  | "TELNYX_NOT_CONFIGURED";

export type PowerDispatchResult = {
  ok: true;
  code: PowerDispatchCode;
  dispatched: number;
  failed: number;
  ready: number;
  inFlight: number;
  target: number;
  effectiveRatio: number;
  limitedBy: PowerDispatchLimit;
  channelLimit: number | null;
  channelsInUse: number;
  brakeActive: boolean;
  dropRate: number | null;
  cancelled: number;
  nextEligibleAt: string | null;
  errors?: { leadId: string; error: string }[];
};

async function nextPowerEligibleAt(campaign: PowerCampaign, now: Date): Promise<Date | null> {
  const [eligible, voicemail, notHome] = await Promise.all([
    prisma.lead.aggregate({
      where: { campaignId: campaign.id, status: "NEW", powerDialerEligibleAfter: { gt: now } },
      _min: { powerDialerEligibleAfter: true },
    }),
    prisma.lead.aggregate({
      where: { campaignId: campaign.id, status: "VOICEMAIL", callbackScheduledFor: null },
      _min: { voicemailMarkedAt: true },
    }),
    prisma.lead.aggregate({
      where: { campaignId: campaign.id, status: "NOT_HOME", callbackScheduledFor: null },
      _min: { notHomeMarkedAt: true },
    }),
  ]);
  const cooldownMs = Math.max(1, campaign.unansweredCooldownHours) * 60 * 60 * 1000;
  const candidates = [
    eligible._min.powerDialerEligibleAfter,
    voicemail._min.voicemailMarkedAt ? new Date(voicemail._min.voicemailMarkedAt.getTime() + cooldownMs) : null,
    notHome._min.notHomeMarkedAt ? new Date(notHome._min.notHomeMarkedAt.getTime() + cooldownMs) : null,
  ].filter((d): d is Date => d instanceof Date);
  if (candidates.length === 0) return null;
  return new Date(Math.max(now.getTime(), Math.min(...candidates.map((d) => d.getTime()))));
}

function advisoryKey(campaignId: string): string {
  return `power-dispatch:${campaignId}`;
}

/**
 * Én dispatch-runde for kampagnen, udløst af en klar sælgers heartbeat. Tælling og reservation
 * sker under en Postgres advisory-lås, så flere sælgeres samtidige heartbeats ikke overbooker.
 */
export async function runPowerDispatch(params: {
  campaign: PowerCampaign;
  callerUserId: string;
}): Promise<PowerDispatchResult> {
  const { campaign, callerUserId } = params;
  const settings = campaign.settings;
  const now = new Date();
  const apiKey = telnyxApiKey();
  const connectionId = getTelnyxConnectionId();

  const base: PowerDispatchResult = {
    ok: true,
    code: "AT_CAPACITY",
    dispatched: 0,
    failed: 0,
    ready: 0,
    inFlight: 0,
    target: 0,
    effectiveRatio: settings.dialRatio,
    limitedBy: "none",
    channelLimit: null,
    channelsInUse: 0,
    brakeActive: false,
    dropRate: null,
    cancelled: 0,
    nextEligibleAt: null,
  };

  if (!apiKey || !connectionId) return { ...base, code: "TELNYX_NOT_CONFIGURED" };

  const caller = await prisma.agentSession.findFirst({
    where: { ...dialableAgentWhere(campaign.id, now), userId: callerUserId },
    select: { id: true },
  });
  if (!caller) return { ...base, code: "CALLER_NOT_READY" };

  await runPowerMaintenance(campaign);

  const channel = await resolvePowerChannelLimit();

  // Forhåndsberegning uden lås: hent kun kandidater, hvis der er plads til nye opkald.
  const [preReady, preInFlight, brake, preChannels] = await Promise.all([
    countDialableAgents(prisma, campaign.id, now),
    loadUnassignedInFlight(prisma, campaign.id, now),
    getPowerDropBrake(prisma, campaign.id, settings, now),
    countPowerChannelsInUse(prisma, now),
  ]);
  const prePlan = computePowerDispatchPlan({
    readyAgents: preReady,
    ratio: settings.dialRatio,
    brakeActive: brake.active,
    maxInFlight: settings.maxInFlight,
    unassignedInFlight: preInFlight.unassigned,
    ringingUnanswered: preInFlight.ringing.length,
    channelLimit: channel.effective,
    channelsInUse: preChannels,
  });
  const candidates =
    prePlan.newCalls > 0
      ? await listPowerDialerCandidates(prisma, {
          campaign,
          limit: prePlan.newCalls * 3 + 5,
          now,
        })
      : [];

  const locked = await prisma.$transaction(
    async (tx) => {
      const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${advisoryKey(campaign.id)})) AS "locked"`;
      if (!lockRows[0]?.locked) return null;
      const [ready, inFlight, channelsInUse] = await Promise.all([
        countDialableAgents(tx, campaign.id, now),
        loadUnassignedInFlight(tx, campaign.id, now),
        countPowerChannelsInUse(tx, now),
      ]);
      const plan = computePowerDispatchPlan({
        readyAgents: ready,
        ratio: settings.dialRatio,
        brakeActive: brake.active,
        maxInFlight: settings.maxInFlight,
        unassignedInFlight: inFlight.unassigned,
        ringingUnanswered: inFlight.ringing.length,
        channelLimit: channel.effective,
        channelsInUse,
      });
      const claimed =
        plan.newCalls > 0 && candidates.length > 0
          ? await claimPowerDialerLeads(tx, {
              campaignId: campaign.id,
              candidates,
              count: plan.newCalls,
              now,
              expiresAt: new Date(now.getTime() + powerQueueReservationTtlMs(settings.ringTimeoutSecs)),
            })
          : [];
      return { ready, inFlight, channelsInUse, plan, claimed };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  if (!locked) {
    return { ...base, code: "BUSY", brakeActive: brake.active, dropRate: brake.dropRate };
  }

  const { plan, claimed } = locked;
  const batchId = `pd_${now.getTime()}_${callerUserId.slice(-4)}`;
  const webhookUrl = process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined;
  const errors: { leadId: string; error: string }[] = [];
  let dispatched = 0;

  await Promise.all(
    claimed.map(async (c) => {
      const restore = async (error: string) => {
        errors.push({ leadId: c.leadId, error });
        await prisma.dialerQueueItem.deleteMany({ where: { id: c.queueItemId } });
        await prisma.lead.updateMany({
          where: { id: c.leadId, lastDialAttemptAt: now },
          data: { lastDialAttemptAt: c.lastDialAttemptAt },
        });
      };
      const from = pickTelnyxFromNumber(c.leadId, { userId: callerUserId, extraSalt: batchId });
      if (!from) {
        await restore("TELNYX_FROM_NUMBER mangler");
        return;
      }
      const dial = await dialTelnyxOutbound({
        connectionId,
        apiKey,
        from,
        to: c.e164,
        clientState: encodeDialerClientState({
          v: 2,
          kind: "lead",
          campaignId: campaign.id,
          leadId: c.leadId,
          queueItemId: c.queueItemId,
          batchId,
          dialMode: "POWER_DIALER",
          phoneE164: c.e164,
        }),
        webhookUrl,
        amd: settings.amdEnabled
          ? { mode: "premium", totalAnalysisTimeMs: POWER_AMD_TOTAL_ANALYSIS_MS }
          : undefined,
        timeoutSecs: settings.ringTimeoutSecs,
        retryOnTimeout: false,
        commandId: `power-dial-${c.queueItemId}`,
      });
      if (!dial.ok) {
        await restore(dial.message);
        return;
      }
      dispatched += 1;
      await prisma.dialerCallLog.createMany({
        data: [
          {
            campaignId: campaign.id,
            leadId: c.leadId,
            callControlId: dial.callControlId,
            callSessionId: dial.callSessionId ?? null,
            direction: "outbound-lead",
            state: "initiated",
            fromNumber: from,
            toNumber: c.e164,
          },
        ],
        skipDuplicates: true,
      });
      await prisma.dialerCallLog.updateMany({
        where: { callControlId: dial.callControlId },
        data: { leadId: c.leadId, fromNumber: from, toNumber: c.e164 },
      });
      await prisma.dialerQueueItem.updateMany({
        where: { id: c.queueItemId },
        data: { activeCallControlId: dial.callControlId, attempts: { increment: 1 } },
      });
      // Meget hurtige hangups (fx ugyldigt nummer) kan være afgjort før vi nåede at gemme benet.
      const leg = await prisma.dialerCallLog.findUnique({
        where: { callControlId: dial.callControlId },
        select: { resolvedAt: true, endedAt: true, bridgedAt: true },
      });
      if (leg && !leg.bridgedAt && (leg.resolvedAt || leg.endedAt)) {
        await prisma.dialerQueueItem.deleteMany({ where: { id: c.queueItemId, connectedAt: null } });
      }
    }),
  );

  const cancelled = plan.cancelRinging > 0 ? await enforcePowerCapacity(campaign.id, campaign) : 0;

  const inFlightAfter = locked.inFlight.unassigned + dispatched;
  let code: PowerDispatchCode = dispatched > 0 ? "DIALED" : "AT_CAPACITY";
  if (dispatched === 0) {
    if (locked.ready === 0) code = "NO_READY_AGENTS";
    else if (plan.limitedBy === "channel_limit") code = "CHANNEL_LIMIT";
    else if (plan.newCalls > 0 && claimed.length === 0) code = "QUEUE_EMPTY";
  }
  const nextEligibleAt =
    code === "QUEUE_EMPTY" ? ((await nextPowerEligibleAt(campaign, now))?.toISOString() ?? null) : null;

  return {
    ok: true,
    code,
    dispatched,
    failed: errors.length,
    ready: locked.ready,
    inFlight: inFlightAfter,
    target: plan.target,
    effectiveRatio: plan.effectiveRatio,
    limitedBy: plan.limitedBy,
    channelLimit: channel.effective,
    channelsInUse: locked.channelsInUse + dispatched,
    brakeActive: brake.active,
    dropRate: brake.dropRate,
    cancelled,
    nextEligibleAt,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

// ---------------------------------------------------------------------------
// Status til presence / admin
// ---------------------------------------------------------------------------

export type PowerCampaignStats = {
  ready: number;
  readyNotConnected: number;
  ringing: number;
  talking: number;
  wrapUp: number;
  paused: number;
  inFlight: number;
  ringingLeads: number;
  channelsInUse: number;
  channelLimit: number | null;
  brakeActive: boolean;
  dropRate: number | null;
  dropSample: number;
  target: number;
};

export async function getPowerCampaignStats(campaign: PowerCampaign): Promise<PowerCampaignStats> {
  const now = new Date();
  const cutoff = freshCutoff(now);
  const [sessions, inFlight, channelsInUse, channel, brake] = await Promise.all([
    prisma.agentSession.findMany({
      where: { campaignId: campaign.id, lastHeartbeat: { gte: cutoff } },
      select: { status: true, webrtcReady: true, wrapUpUntil: true },
    }),
    loadUnassignedInFlight(prisma, campaign.id, now),
    countPowerChannelsInUse(prisma, now),
    resolvePowerChannelLimit(),
    getPowerDropBrake(prisma, campaign.id, campaign.settings, now),
  ]);
  const dialable = sessions.filter(
    (s) =>
      s.status === "ready" && s.webrtcReady && (!s.wrapUpUntil || s.wrapUpUntil.getTime() <= now.getTime()),
  ).length;
  const plan = computePowerDispatchPlan({
    readyAgents: dialable,
    ratio: campaign.settings.dialRatio,
    brakeActive: brake.active,
    maxInFlight: campaign.settings.maxInFlight,
    unassignedInFlight: inFlight.unassigned,
    ringingUnanswered: inFlight.ringing.length,
    channelLimit: channel.effective,
    channelsInUse,
  });
  return {
    ready: dialable,
    readyNotConnected: sessions.filter((s) => s.status === "ready" && !s.webrtcReady).length,
    ringing: sessions.filter((s) => s.status === "ringing").length,
    talking: sessions.filter((s) => s.status === "talking").length,
    wrapUp:
      sessions.filter((s) => s.status === "wrap_up").length +
      sessions.filter(
        (s) => s.status === "ready" && s.wrapUpUntil !== null && s.wrapUpUntil.getTime() > now.getTime(),
      ).length,
    paused: sessions.filter((s) => s.status === "paused" || s.status === "draining").length,
    inFlight: inFlight.unassigned,
    ringingLeads: inFlight.ringing.length,
    channelsInUse,
    channelLimit: channel.effective,
    brakeActive: brake.active,
    dropRate: brake.dropRate,
    dropSample: brake.sample,
    target: plan.target,
  };
}
