/**
 * Medlyt (admin): list live dialer-sælgere og start stille Telnyx Supervising Leg (monitor).
 */

import { prisma } from "@/lib/prisma";
import {
  PRESENCE_FRESH_WINDOW_MS,
  decodeDialerClientState,
  encodeDialerClientState,
} from "@/lib/dialer-shared";
import {
  dialTelnyxOutbound,
  getTelnyxConnectionId,
  hangupTelnyxCall,
  listTelnyxActiveCalls,
  pickTelnyxFromNumber,
  switchTelnyxSupervisorRole,
} from "@/lib/telnyx-call-control";
import {
  ensurePowerDialerAgentTelnyx,
  powerAgentSipUri,
  resolvePowerAgentOutboundConnectionId,
} from "@/lib/telnyx-power-agent";

const LIVE_STATUSES = ["ready", "ringing", "talking", "wrap_up", "draining", "paused"] as const;
const LISTENABLE_STATUSES = ["ringing", "talking"] as const;

export type MedlytAgentRow = {
  userId: string;
  name: string;
  username: string;
  status: string;
  campaignId: string | null;
  campaignName: string | null;
  leadId: string | null;
  hasLeadLeg: boolean;
  /** Grøn = talking, blå = ringing, amber = klar på kampagne, disabled = ikke i dialer. */
  buttonTone: "green" | "blue" | "ready" | "disabled";
  canStart: boolean;
};

/**
 * Browser-Medlyt: knap aktiv så længe sælgeren er i dialeren (klar/ringer/taler).
 * Mic streames via browser — kræver ikke Telnyx call-leg.
 */
export function medlytButtonTone(status: string): MedlytAgentRow["buttonTone"] {
  if (status === "talking") return "green";
  if (status === "ringing") return "blue";
  if (
    status === "ready" ||
    status === "paused" ||
    status === "wrap_up" ||
    status === "draining"
  ) {
    return "ready";
  }
  return "disabled";
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return null;
}

export type MedlytSupervisedLeg = "agent" | "lead";

export type MedlytSuperviseTarget = {
  callControlId: string;
  /** agent = sælgerens ben (whisper går kun til sælger); lead = kundens ben (whisper usikker). */
  leg: MedlytSupervisedLeg;
};

/**
 * Find et Telnyx-ben at supervise.
 * Foretræk agent/WebRTC — whisper går kun til det supervisede ben, så sælger-coaching
 * kræver agent-benet (ellers ville kunden høre admin).
 * Under ringing (bip/jingle) findes ofte kun lead-benet — det er OK til stille medlyt.
 */
export async function resolveMedlytSuperviseCallControlId(session: {
  userId: string;
  campaignId?: string | null;
  currentLeadId: string | null;
  currentLeadCallControlId: string | null;
  currentAgentCallControlId: string | null;
  webRtcCallControlId: string | null;
}): Promise<MedlytSuperviseTarget | null> {
  const agentCc = firstNonEmpty(
    session.currentAgentCallControlId,
    session.webRtcCallControlId,
  );
  if (agentCc) return { callControlId: agentCc, leg: "agent" };

  const leadCc = firstNonEmpty(session.currentLeadCallControlId);
  if (leadCc) return { callControlId: leadCc, leg: "lead" };

  const openLog = await prisma.dialerCallLog.findFirst({
    where: {
      agentUserId: session.userId,
      endedAt: null,
      state: { in: ["initiated", "ringing", "answered", "bridged", "human"] },
    },
    orderBy: { startedAt: "desc" },
    select: { callControlId: true, bridgeTargetId: true, direction: true },
  });
  if (openLog) {
    // Agent-loggen er sælgerens ben — foretræk den til whisper.
    if (openLog.direction === "outbound-agent") {
      const cc = openLog.callControlId?.trim();
      if (cc) return { callControlId: cc, leg: "agent" };
    }
    if (openLog.direction === "outbound-lead") {
      const cc = openLog.callControlId?.trim();
      if (cc) return { callControlId: cc, leg: "lead" };
    }
    const bridged = openLog.bridgeTargetId?.trim();
    if (bridged) return { callControlId: bridged, leg: "lead" };
    const cc = openLog.callControlId?.trim();
    if (cc) return { callControlId: cc, leg: "lead" };
  }

  if (session.currentLeadId) {
    const agentLog = await prisma.dialerCallLog.findFirst({
      where: {
        leadId: session.currentLeadId,
        endedAt: null,
        direction: "outbound-agent",
      },
      orderBy: { startedAt: "desc" },
      select: { callControlId: true },
    });
    const agentFromLog = agentLog?.callControlId?.trim();
    if (agentFromLog) return { callControlId: agentFromLog, leg: "agent" };

    const leadLog = await prisma.dialerCallLog.findFirst({
      where: {
        leadId: session.currentLeadId,
        endedAt: null,
        direction: "outbound-lead",
      },
      orderBy: { startedAt: "desc" },
      select: { callControlId: true },
    });
    const leadFromLog = leadLog?.callControlId?.trim();
    if (leadFromLog) return { callControlId: leadFromLog, leg: "lead" };
  }

  // Kampagne-åbne lead-ben (predictive dialer før agentUserId sættes).
  if (session.campaignId) {
    const campLead = await prisma.dialerCallLog.findFirst({
      where: {
        campaignId: session.campaignId,
        endedAt: null,
        direction: "outbound-lead",
        state: { in: ["initiated", "ringing", "answered", "human", "bridged"] },
        OR: [{ agentUserId: session.userId }, { agentUserId: null }],
      },
      orderBy: { startedAt: "desc" },
      select: { callControlId: true, agentUserId: true },
    });
    if (campLead) {
      const campCc = campLead.callControlId?.trim();
      if (campCc && (!campLead.agentUserId || campLead.agentUserId === session.userId)) {
        return { callControlId: campCc, leg: "lead" };
      }
    }
  }

  // Live Telnyx-fallback på Call Control-appen (credential-connections understøtter IKKE active_calls).
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  const globalConn = getTelnyxConnectionId();
  if (apiKey && globalConn) {
    const live = await listTelnyxActiveCalls({ apiKey, connectionId: globalConn });
    if (live.ok) {
      for (const call of live.calls) {
        const state = decodeDialerClientState(call.clientState);
        if (!state) continue;
        if (state.kind === "agent" && "userId" in state && state.userId === session.userId) {
          return { callControlId: call.callControlId, leg: "agent" };
        }
      }
      if (session.campaignId) {
        for (const call of live.calls) {
          const state = decodeDialerClientState(call.clientState);
          if (!state || state.kind !== "lead") continue;
          if (state.campaignId !== session.campaignId) continue;
          return { callControlId: call.callControlId, leg: "lead" };
        }
      }
    } else {
      console.warn("[medlyt] active_calls fejlede:", live.message);
    }
  }

  return null;
}

export async function listMedlytAgents(): Promise<MedlytAgentRow[]> {
  const freshAfter = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  const sessions = await prisma.agentSession.findMany({
    where: {
      lastHeartbeat: { gte: freshAfter },
      status: { in: [...LIVE_STATUSES] },
    },
    select: {
      userId: true,
      status: true,
      campaignId: true,
      currentLeadId: true,
      currentLeadCallControlId: true,
      currentAgentCallControlId: true,
      webRtcCallControlId: true,
      user: { select: { name: true, username: true } },
      campaign: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { lastHeartbeat: "desc" }],
  });

  // Én række pr. bruger (mest «live» session vinder).
  const byUser = new Map<string, (typeof sessions)[number]>();
  const rank = (s: string) =>
    s === "talking" ? 0 : s === "ringing" ? 1 : s === "ready" ? 2 : 3;
  for (const s of sessions) {
    const prev = byUser.get(s.userId);
    if (!prev || rank(s.status) < rank(prev.status)) byUser.set(s.userId, s);
  }

  return [...byUser.values()]
    .map((s) => {
      const hasLeadLeg = Boolean(
        firstNonEmpty(
          s.currentLeadCallControlId,
          s.currentAgentCallControlId,
          s.webRtcCallControlId,
        ),
      );
      const tone = medlytButtonTone(s.status);
      return {
        userId: s.userId,
        name: s.user.name,
        username: s.user.username,
        status: s.status,
        campaignId: s.campaignId,
        campaignName: s.campaign?.name ?? null,
        leadId: s.currentLeadId,
        hasLeadLeg,
        buttonTone: tone,
        canStart: tone !== "disabled",
      };
    })
    .sort((a, b) => {
      const tr = (t: MedlytAgentRow["buttonTone"]) =>
        t === "green" ? 0 : t === "blue" ? 1 : t === "ready" ? 2 : 3;
      const d = tr(a.buttonTone) - tr(b.buttonTone);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, "da");
    });
}

export type MedlytStartResult =
  | {
      ok: true;
      supervisorCallControlId: string;
      targetUserId: string;
      leadCallControlId: string;
      supervisedLeg: MedlytSupervisedLeg;
      /** True når whisper til sælger er sikkert (supervisede ben er agent). */
      whisperAvailable: boolean;
    }
  | { ok: false; status: number; error: string };

/** Start stille medlyt: dial supervisor-WebRTC ind på et aktivt samtale-ben. */
export async function startMedlyt(params: {
  supervisorUserId: string;
  targetUserId: string;
}): Promise<MedlytStartResult> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, error: "TELNYX_API_KEY mangler." };
  }

  const freshAfter = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  const target = await prisma.agentSession.findFirst({
    where: {
      userId: params.targetUserId,
      lastHeartbeat: { gte: freshAfter },
      status: { in: [...LISTENABLE_STATUSES] },
    },
    orderBy: { lastHeartbeat: "desc" },
    select: {
      userId: true,
      campaignId: true,
      currentLeadId: true,
      currentLeadCallControlId: true,
      currentAgentCallControlId: true,
      webRtcCallControlId: true,
      status: true,
    },
  });
  if (!target) {
    return {
      ok: false,
      status: 409,
      error: "Sælgeren er ikke i dialeren med et aktivt opkald lige nu.",
    };
  }

  const supervise = await resolveMedlytSuperviseCallControlId({
    ...target,
    campaignId: target.campaignId,
  });
  if (!supervise) {
    console.warn("[medlyt] ingen supervise-target", {
      targetUserId: params.targetUserId,
      status: target.status,
      hasLeadCc: Boolean(target.currentLeadCallControlId),
      hasAgentCc: Boolean(target.currentAgentCallControlId),
      hasWebRtcCc: Boolean(target.webRtcCallControlId),
    });
    return {
      ok: false,
      status: 409,
      error:
        "Kunne ikke finde sælgerens aktive opkalds-ben. Bed sælgeren om at have dialeren åben (headset aktiv). Prøv igen om 2–3 sekunder.",
    };
  }

  // Cache fundet ben på sessionen så næste Start er hurtigere.
  await prisma.agentSession.updateMany({
    where: { userId: params.targetUserId },
    data:
      supervise.leg === "agent"
        ? {
            webRtcCallControlId: supervise.callControlId,
            currentAgentCallControlId: supervise.callControlId,
          }
        : { currentLeadCallControlId: supervise.callControlId },
  });
  const superviseCc = supervise.callControlId;

  await ensurePowerDialerAgentTelnyx({ userId: params.supervisorUserId, apiKey }).catch(() => null);
  const supervisor = await prisma.user.findUnique({
    where: { id: params.supervisorUserId },
    select: {
      telnyxCredentialSipUsername: true,
      telnyxSipUsername: true,
    },
  });
  const sipUri = powerAgentSipUri({
    telnyxCredentialSipUsername: supervisor?.telnyxCredentialSipUsername ?? null,
    telnyxSipUsername: supervisor?.telnyxSipUsername ?? null,
  });
  if (!sipUri) {
    return {
      ok: false,
      status: 409,
      error: "Din Telnyx-telefon er ikke klar. Provisionér under Administration → Telnyx.",
    };
  }

  const connectionId = await resolvePowerAgentOutboundConnectionId({
    apiKey,
    agentUserId: params.supervisorUserId,
  });
  if (!connectionId) {
    return {
      ok: false,
      status: 409,
      error: "Mangler Telnyx connection til din WebRTC-telefon.",
    };
  }

  const from =
    pickTelnyxFromNumber(target.currentLeadId ?? params.supervisorUserId, {
      userId: params.supervisorUserId,
    }) ?? "";
  if (!from) {
    return { ok: false, status: 503, error: "Ingen udgående Telnyx-numre konfigureret." };
  }

  const dial = await dialTelnyxOutbound({
    connectionId,
    apiKey,
    from,
    to: sipUri,
    superviseCallControlId: superviseCc,
    supervisorRole: "monitor",
    clientState: encodeDialerClientState({
      v: 1,
      kind: "agent",
      campaignId: target.campaignId,
      leadId: target.currentLeadId ?? undefined,
      userId: params.supervisorUserId,
      linkedCallControlId: superviseCc,
      dialMode: "POWER_DIALER",
    }),
    webhookUrl: process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined,
    timeoutSecs: 30,
    commandId: `medlyt-${params.targetUserId}-${superviseCc.slice(-12)}-${Date.now()}`,
  });

  if (!dial.ok) {
    return {
      ok: false,
      status: dial.status || 502,
      error: dial.message.slice(0, 200) || "Kunne ikke starte medlyt.",
    };
  }

  await prisma.dialerCallLog.createMany({
    data: [
      {
        campaignId: target.campaignId,
        leadId: target.currentLeadId,
        agentUserId: params.supervisorUserId,
        callControlId: dial.callControlId,
        callSessionId: dial.callSessionId ?? null,
        direction: "outbound-monitor",
        state: "initiated",
        bridgeTargetId: superviseCc,
        toNumber: sipUri,
        fromNumber: from,
      },
    ],
    skipDuplicates: true,
  });

  return {
    ok: true,
    supervisorCallControlId: dial.callControlId,
    targetUserId: params.targetUserId,
    leadCallControlId: superviseCc,
    supervisedLeg: supervise.leg,
    whisperAvailable: supervise.leg === "agent",
  };
}

/** Skift supervisor-rolle: whisper (tal til sælger) ↔ monitor (stille). */
export async function setMedlytWhisper(params: {
  supervisorCallControlId: string;
  enabled: boolean;
}): Promise<{ ok: true; role: "whisper" | "monitor" } | { ok: false; status: number; error: string }> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, error: "TELNYX_API_KEY mangler." };
  }
  const cc = params.supervisorCallControlId.trim();
  if (!cc) {
    return { ok: false, status: 400, error: "supervisorCallControlId mangler." };
  }
  const role = params.enabled ? "whisper" : "monitor";
  const result = await switchTelnyxSupervisorRole({
    apiKey,
    callControlId: cc,
    role,
    commandId: `medlyt-role-${role}-${cc.slice(-12)}-${Date.now()}`,
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 502,
      error: result.message.slice(0, 200) || "Kunne ikke skifte medlyt-rolle.",
    };
  }
  return { ok: true, role };
}

export async function stopMedlyt(params: {
  supervisorCallControlId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, error: "TELNYX_API_KEY mangler." };
  }
  const cc = params.supervisorCallControlId.trim();
  if (!cc) {
    return { ok: false, status: 400, error: "callControlId mangler." };
  }
  await hangupTelnyxCall({
    apiKey,
    callControlId: cc,
    commandId: `medlyt-hangup-${cc.slice(-16)}`,
  }).catch(() => undefined);
  await prisma.dialerCallLog.updateMany({
    where: { callControlId: cc, endedAt: null },
    data: { endedAt: new Date(), state: "hangup", hangupCause: "medlyt_stop" },
  });
  return { ok: true };
}
