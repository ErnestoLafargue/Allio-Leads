import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";
import {
  powerPoolCampaignIdsForUser,
  userCanAccessCampaign,
} from "@/lib/campaign-access";
import {
  enforcePowerCapacity,
  getPowerCampaignStats,
  getPowerPoolStats,
  isPowerCampaign,
  loadPowerCampaign,
  POWER_CAMPAIGN_SELECT,
  runPowerMaintenance,
  type PowerCampaign,
} from "@/lib/power-dialer-engine";
import { powerDialerSettingsFromCampaign } from "@/lib/power-dialer-settings";
import { reducePowerPresence, type PowerAgentServerState } from "@/lib/power-dialer-presence";
import { POWER_RESERVATION_STALE_MS } from "@/lib/power-dialer-constants";
import {
  creditDialerLineOccupancy,
  linePhaseFromAgentStatus,
} from "@/lib/dialer-line-occupancy";
import { pickPowerPoolDialRatio } from "@/lib/power-dialer-pool";

/**
 * Heartbeat / presence fra agent-workspaces (hver 5. sek).
 *
 * Power Dialer: `{ campaignId, powerPool?, power: { clientInstanceId, intent, leadOpen, lineLive,
 * webrtcReady, takeover?, skipWrapUp? } }` — serveren bestemmer status
 * (se `lib/power-dialer-presence.ts`). `powerPool: true` = anker-session for «Power: alle tildelte».
 *
 * Øvrige modes (predictive): `{ campaignId, status }` som før.
 */

const ALLOWED_STATUSES = new Set(["ready", "ringing", "talking", "wrap_up", "offline"]);

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

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

  if (body?.power && typeof body.power === "object") {
    return powerPresence(userId, campaignId, body.power as Record<string, unknown>, {
      powerPool: body.powerPool === true,
    });
  }

  const status = typeof body?.status === "string" ? body.status.trim() : "";
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Ugyldig status (skal være én af: ${[...ALLOWED_STATUSES].join(", ")})` },
      { status: 400 },
    );
  }

  // Medlyt: sælgerens browser sender aktivt WebRTC call_control_id på hvert heartbeat.
  const hasCallControlField = Object.prototype.hasOwnProperty.call(body ?? {}, "callControlId");
  const callControlId =
    body?.callControlId === null || body?.callControlId === ""
      ? null
      : typeof body?.callControlId === "string"
        ? body.callControlId.trim()
        : undefined;

  // Hvis vi sender "offline" → slet sessionen helt så den ikke fylder i pacing-aggregater.
  if (status === "offline") {
    await prisma.agentSession.deleteMany({
      where: { userId, campaignId },
    });
    await creditDialerLineOccupancy({ userId, campaignId, phase: null }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: "offline" });
  }

  // Sørg for at brugerens telnyxSipUsername er sat — uden det kan dispatcher ikke ringe agenten op.
  // Vi blokerer ikke heartbeat, men sender en advarsel tilbage så frontend kan vise det.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telnyxSipUsername: true, telnyxCredentialId: true },
  });
  const sipReady = Boolean(user?.telnyxSipUsername && user?.telnyxCredentialId);

  const heartbeatAt = new Date();
  const existing = await prisma.agentSession.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { id: true, status: true },
  });

  const ccPatch =
    hasCallControlField && callControlId !== undefined
      ? {
          webRtcCallControlId: callControlId,
          ...(callControlId ? { currentAgentCallControlId: callControlId } : {}),
        }
      : {};

  if (existing) {
    await prisma.agentSession.update({
      where: { id: existing.id },
      data: { status, lastHeartbeat: heartbeatAt, ...ccPatch },
    });
  } else {
    await prisma.agentSession.create({
      data: { userId, campaignId, status, lastHeartbeat: heartbeatAt, ...ccPatch },
    });
  }
  await creditDialerLineOccupancy({
    userId,
    campaignId,
    phase: linePhaseFromAgentStatus(status),
  }).catch(() => undefined);

  // Returnér antal aktive ready agenter + in-flight opkald så klienten kan vise pacing-info
  const cutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  const [readySessions, ringingCount, talkingCount, inFlightCalls, mySession] = await Promise.all([
    prisma.agentSession.findMany({
      where: { campaignId, status: "ready", lastHeartbeat: { gte: cutoff } },
      select: {
        id: true,
        user: { select: { telnyxSipUsername: true, telnyxCredentialId: true } },
      },
    }),
    prisma.agentSession.count({
      where: { campaignId, status: "ringing", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.agentSession.count({
      where: { campaignId, status: "talking", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.dialerCallLog.count({
      where: {
        campaignId,
        direction: "outbound-lead",
        state: { in: ["initiated", "ringing", "answered"] },
        endedAt: null,
      },
    }),
    prisma.agentSession.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: {
        status: true,
        currentLeadId: true,
        currentLeadCallControlId: true,
        currentAgentCallControlId: true,
      },
    }),
  ]);
  const readyCount = readySessions.length;
  const readyForDispatch = readySessions.filter(
    (s) => Boolean(s.user.telnyxSipUsername && s.user.telnyxCredentialId),
  ).length;

  const assignedLead = await loadAssignedLead(campaignId, mySession);

  return NextResponse.json({
    ok: true,
    status,
    sipReady,
    presence: {
      ready: readyCount,
      readyForDispatch,
      ringing: ringingCount,
      talking: talkingCount,
      inFlightCalls,
    },
    assignedLead,
    serverStatus: mySession?.status ?? null,
  });
}

async function loadAssignedLead(
  campaignId: string,
  s: {
    status: string;
    currentLeadId: string | null;
    currentLeadCallControlId: string | null;
    currentAgentCallControlId: string | null;
  } | null,
  opts?: { powerPool?: boolean },
) {
  if (!s || (s.status !== "ringing" && s.status !== "talking") || !s.currentLeadId) return null;
  const lead = await prisma.lead.findUnique({
    where: { id: s.currentLeadId },
    select: { id: true, companyName: true, phone: true, campaignId: true },
  });
  if (!lead) return null;
  if (!opts?.powerPool && lead.campaignId !== campaignId) return null;
  return {
    id: lead.id,
    companyName: lead.companyName,
    phone: lead.phone,
    campaignId: lead.campaignId,
    leadCallControlId: s.currentLeadCallControlId,
    agentCallControlId: s.currentAgentCallControlId,
  };
}

function bool(v: unknown): boolean {
  return v === true;
}

async function powerPresence(
  userId: string,
  campaignId: string,
  power: Record<string, unknown>,
  opts: { powerPool: boolean },
) {
  const clientInstanceId =
    typeof power.clientInstanceId === "string" ? power.clientInstanceId.trim().slice(0, 64) : "";
  if (!clientInstanceId) {
    return NextResponse.json({ error: "clientInstanceId er påkrævet" }, { status: 400 });
  }
  const campaign = await loadPowerCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  if (!isPowerCampaign(campaign)) {
    return NextResponse.json(
      { code: "NOT_POWER_DIALER", error: "Kampagnen er ikke sat til Power Dialer." },
      { status: 409 },
    );
  }

  let poolCampaignIds: string[] = [];
  if (opts.powerPool) {
    poolCampaignIds = await powerPoolCampaignIdsForUser(userId);
    if (poolCampaignIds.length === 0 || poolCampaignIds[0] !== campaignId) {
      return NextResponse.json(
        {
          error:
            "Power-puljen er tom eller anker-kampagnen matcher ikke. Genindlæs Start og prøv igen.",
        },
        { status: 409 },
      );
    }
  }

  const intentRaw = typeof power.intent === "string" ? power.intent : "ready";
  if (intentRaw === "offline") {
    const removed = await prisma.agentSession.deleteMany({
      where: {
        userId,
        campaignId,
        OR: [{ clientInstanceId }, { clientInstanceId: null }],
      },
    });
    if (removed.count > 0) await enforcePowerCapacity(campaignId, campaign);
    await creditDialerLineOccupancy({ userId, campaignId, phase: null }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: "offline" });
  }

  const takeover = bool(power.takeover);
  if (takeover) {
    // Én Power-session pr. sælger globalt (enkeltkampagne eller pulje).
    await prisma.agentSession.deleteMany({
      where: { userId, campaignId: { not: campaignId }, campaign: { dialMode: "POWER_DIALER" } },
    });
  }

  await runPowerMaintenance(campaign).catch((err) => {
    console.error("[power-dialer] oprydning fejlede:", err);
  });

  const report = {
    clientInstanceId,
    intent: intentRaw === "pause" ? ("pause" as const) : ("ready" as const),
    leadOpen: bool(power.leadOpen),
    lineLive: bool(power.lineLive),
    webrtcReady: bool(power.webrtcReady),
    takeover,
    skipWrapUp: bool(power.skipWrapUp),
  };

  const hasCallControlField = Object.prototype.hasOwnProperty.call(power, "callControlId");
  const callControlId =
    power.callControlId === null || power.callControlId === ""
      ? null
      : typeof power.callControlId === "string"
        ? power.callControlId.trim()
        : null;
  const presenceOpts = {
    powerPool: opts.powerPool,
    hasCallControlField,
    callControlId: hasCallControlField ? callControlId : undefined,
  };

  let result = await applyPowerPresence(userId, campaign, report, presenceOpts);
  if (result === "conflict") {
    result = await applyPowerPresence(userId, campaign, report, presenceOpts);
  }
  if (result === "conflict") {
    return NextResponse.json({ ok: false, error: "Status blev ændret samtidig — prøv igen." }, { status: 409 });
  }
  if (result.superseded) {
    return NextResponse.json({
      ok: true,
      superseded: true,
      status: result.status,
      message: "Power Dialer er åbnet i en anden fane eller på en anden computer.",
    });
  }

  const mine = await prisma.agentSession.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: {
      status: true,
      wrapUpUntil: true,
      drainUntil: true,
      webrtcReady: true,
      powerPool: true,
      currentLeadId: true,
      currentLeadCallControlId: true,
      currentAgentCallControlId: true,
    },
  });

  let stats;
  let settingsPayload: {
    dialRatio: number;
    ringTimeoutSecs: number;
    wrapUpSeconds: number;
    pauseMode: "DRAIN" | "HANGUP_RINGING";
    amdEnabled: boolean;
  };
  if (opts.powerPool) {
    const poolRows = await prisma.campaign.findMany({
      where: { id: { in: poolCampaignIds } },
      select: POWER_CAMPAIGN_SELECT,
    });
    const poolCampaigns: PowerCampaign[] = poolRows.map((c) => ({
      ...c,
      settings: powerDialerSettingsFromCampaign(c),
    }));
    stats = await getPowerPoolStats({ anchorCampaign: campaign, poolCampaigns });
    const wrapUpSeconds =
      poolCampaigns.length > 0
        ? Math.max(0, ...poolCampaigns.map((c) => c.settings.wrapUpSeconds))
        : campaign.settings.wrapUpSeconds;
    const ringTimeoutSecs =
      poolCampaigns.length > 0
        ? Math.max(...poolCampaigns.map((c) => c.settings.ringTimeoutSecs))
        : campaign.settings.ringTimeoutSecs;
    settingsPayload = {
      dialRatio: pickPowerPoolDialRatio(poolCampaigns.map((c) => c.settings)),
      ringTimeoutSecs,
      wrapUpSeconds,
      pauseMode: campaign.settings.pauseMode,
      amdEnabled:
        poolCampaigns.length > 0
          ? poolCampaigns.some((c) => c.settings.amdEnabled)
          : campaign.settings.amdEnabled,
    };
  } else {
    stats = await getPowerCampaignStats(campaign);
    settingsPayload = {
      dialRatio: campaign.settings.dialRatio,
      ringTimeoutSecs: campaign.settings.ringTimeoutSecs,
      wrapUpSeconds: campaign.settings.wrapUpSeconds,
      pauseMode: campaign.settings.pauseMode,
      amdEnabled: campaign.settings.amdEnabled,
    };
  }

  const [assignedLead, user] = await Promise.all([
    loadAssignedLead(campaignId, mine, { powerPool: opts.powerPool }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { telnyxSipUsername: true, telnyxCredentialId: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    superseded: false,
    status: mine?.status ?? "offline",
    wrapUpUntil: mine?.wrapUpUntil?.toISOString() ?? null,
    drainUntil: mine?.drainUntil?.toISOString() ?? null,
    webrtcReady: mine?.webrtcReady ?? false,
    powerPool: mine?.powerPool ?? false,
    sipReady: Boolean(user?.telnyxSipUsername && user?.telnyxCredentialId),
    assignedLead,
    stats,
    settings: settingsPayload,
  });
}

type PowerReport = Parameters<typeof reducePowerPresence>[1];

async function applyPowerPresence(
  userId: string,
  campaign: PowerCampaign,
  report: PowerReport,
  opts: { powerPool: boolean; callControlId?: string | null; hasCallControlField?: boolean } = {
    powerPool: false,
  },
): Promise<"conflict" | { superseded: boolean; status: string }> {
  const now = new Date();
  const prev = await prisma.agentSession.findUnique({
    where: { userId_campaignId: { userId, campaignId: campaign.id } },
    select: {
      id: true,
      status: true,
      webrtcReady: true,
      readySince: true,
      reservedAt: true,
      wrapUpUntil: true,
      drainUntil: true,
      clientInstanceId: true,
      lastHeartbeat: true,
      powerPool: true,
    },
  });
  const prevState: PowerAgentServerState | null = prev
    ? {
        status: prev.status,
        readySince: prev.readySince,
        reservedAt: prev.reservedAt,
        wrapUpUntil: prev.wrapUpUntil,
        drainUntil: prev.drainUntil,
        clientInstanceId: prev.clientInstanceId,
        lastHeartbeat: prev.lastHeartbeat,
      }
    : null;
  const decision = reducePowerPresence(prevState, report, campaign.settings, now, {
    freshWindowMs: PRESENCE_FRESH_WINDOW_MS,
    reservationStaleMs: POWER_RESERVATION_STALE_MS,
  });
  if (decision.superseded) return { superseded: true, status: prev?.status ?? "offline" };

  const next = decision.next;
  const busy = next.status === "ringing" || next.status === "talking";
  const callControlId =
    opts.callControlId === null || opts.callControlId === ""
      ? null
      : typeof opts.callControlId === "string"
        ? opts.callControlId.trim()
        : undefined;
  const data = {
    status: next.status,
    readySince: next.readySince,
    reservedAt: next.reservedAt,
    wrapUpUntil: next.wrapUpUntil,
    drainUntil: next.drainUntil,
    webrtcReady: next.webrtcReady,
    clientInstanceId: next.clientInstanceId,
    lastHeartbeat: now,
    powerPool: opts.powerPool,
    ...(busy
      ? {}
      : {
          currentLeadId: null,
          currentLeadCallControlId: null,
          currentAgentCallControlId: null,
          webRtcCallControlId: null,
        }),
    ...(opts.hasCallControlField && callControlId !== undefined
      ? {
          webRtcCallControlId: callControlId,
          ...(callControlId && busy ? { currentAgentCallControlId: callControlId } : {}),
        }
      : {}),
  };

  if (!prev) {
    try {
      await prisma.agentSession.create({ data: { userId, campaignId: campaign.id, ...data } });
    } catch {
      return "conflict";
    }
  } else {
    const upd = await prisma.agentSession.updateMany({
      where: { id: prev.id, status: prev.status },
      data,
    });
    if (upd.count !== 1) return "conflict";
  }

  const lostCapacity =
    (prev?.status === "ready" && next.status !== "ready") ||
    (prev?.webrtcReady === true && !next.webrtcReady) ||
    decision.releasedReservation;
  if (lostCapacity) await enforcePowerCapacity(campaign.id, campaign);
  await creditDialerLineOccupancy({
    userId,
    campaignId: campaign.id,
    phase: linePhaseFromAgentStatus(next.status),
  }).catch(() => undefined);
  return { superseded: false, status: next.status };
}

export async function DELETE() {
  const { session, response } = await requireSession();
  if (response) return response;
  await prisma.agentSession.deleteMany({
    where: { userId: session!.user.id },
  });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
