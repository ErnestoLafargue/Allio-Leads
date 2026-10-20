/**
 * Medlyt (admin): list live dialer-sælgere og start stille Telnyx Supervising Leg (monitor).
 */

import { prisma } from "@/lib/prisma";
import { PRESENCE_FRESH_WINDOW_MS, encodeDialerClientState } from "@/lib/dialer-shared";
import {
  dialTelnyxOutbound,
  hangupTelnyxCall,
  pickTelnyxFromNumber,
} from "@/lib/telnyx-call-control";
import {
  ensurePowerDialerAgentTelnyx,
  powerAgentSipUri,
  resolvePowerAgentOutboundConnectionId,
} from "@/lib/telnyx-power-agent";

const LIVE_STATUSES = ["ready", "ringing", "talking", "wrap_up", "draining", "paused"] as const;

export type MedlytAgentRow = {
  userId: string;
  name: string;
  username: string;
  status: string;
  campaignId: string | null;
  campaignName: string | null;
  leadId: string | null;
  hasLeadLeg: boolean;
  /** Grøn knap (talking), blå (ringing med lead-leg), ellers disabled. */
  buttonTone: "green" | "blue" | "disabled";
  canStart: boolean;
};

export function medlytButtonTone(status: string, hasLeadLeg: boolean): MedlytAgentRow["buttonTone"] {
  if (status === "talking" && hasLeadLeg) return "green";
  if (status === "ringing" && hasLeadLeg) return "blue";
  return "disabled";
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
      user: { select: { name: true, username: true } },
      campaign: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { lastHeartbeat: "desc" }],
  });

  // Én række pr. bruger (nyeste / mest «live» session vinder).
  const byUser = new Map<string, (typeof sessions)[number]>();
  const rank = (s: string) =>
    s === "talking" ? 0 : s === "ringing" ? 1 : s === "ready" ? 2 : 3;
  for (const s of sessions) {
    const prev = byUser.get(s.userId);
    if (!prev || rank(s.status) < rank(prev.status)) byUser.set(s.userId, s);
  }

  return [...byUser.values()]
    .map((s) => {
      const hasLeadLeg = Boolean(s.currentLeadCallControlId?.trim());
      const tone = medlytButtonTone(s.status, hasLeadLeg);
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
        canStart: tone === "green" || tone === "blue",
      };
    })
    .sort((a, b) => {
      const tr = (t: MedlytAgentRow["buttonTone"]) =>
        t === "green" ? 0 : t === "blue" ? 1 : 2;
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
    }
  | { ok: false; status: number; error: string };

/** Start stille medlyt: dial supervisor-WebRTC ind på lead-benet. */
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
      status: { in: ["ringing", "talking"] },
      currentLeadCallControlId: { not: null },
    },
    orderBy: { lastHeartbeat: "desc" },
    select: {
      campaignId: true,
      currentLeadId: true,
      currentLeadCallControlId: true,
      status: true,
    },
  });
  const leadCc = target?.currentLeadCallControlId?.trim();
  if (!target || !leadCc) {
    return {
      ok: false,
      status: 409,
      error: "Sælgeren er ikke i et opkald, der kan lyttes med på lige nu.",
    };
  }

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
    superviseCallControlId: leadCc,
    supervisorRole: "monitor",
    clientState: encodeDialerClientState({
      v: 1,
      kind: "agent",
      campaignId: target.campaignId,
      leadId: target.currentLeadId ?? undefined,
      userId: params.supervisorUserId,
      linkedCallControlId: leadCc,
      dialMode: "POWER_DIALER",
    }),
    webhookUrl: process.env.TELNYX_CALL_WEBHOOK_URL?.trim() || undefined,
    timeoutSecs: 30,
    commandId: `medlyt-${params.targetUserId}-${leadCc.slice(-12)}-${Date.now()}`,
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
        bridgeTargetId: leadCc,
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
    leadCallControlId: leadCc,
  };
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
