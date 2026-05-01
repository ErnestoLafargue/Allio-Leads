/**
 * Server-side bridge-flow.
 *
 * Når et lead-opkald har AMD=human reagerer vi her: find en ledig agent,
 * placer et nyt udgående mod agentens SIP-URI med `link_to: leadCallControlId`,
 * så Telnyx automatisk bridger så snart agenten svarer.
 *
 * Hvis ingen ledig agent findes inden 8 sek → hangup lead og marker som "no-agent" (sjældent
 * — pacing-algoritmen skal sikre at det ikke sker, men vi vil hellere droppe end at lade
 * et menneske vente i tomgang).
 */

import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@/lib/lead-status";
import {
  bridgeTelnyxCalls,
  buildTelnyxAgentSipUri,
  dialTelnyxOutbound,
  getTelnyxConnectionId,
  hangupTelnyxCall,
  pickTelnyxFromNumber,
  startTelnyxRecording,
} from "@/lib/telnyx-call-control";
import { encodeDialerClientState, PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";

/** Statusser hvor et sent AMD=machine stadig må sætte VOICEMAIL (leadet er stadig i «åben» dialer-pulje). */
const AMD_VOICEMAIL_ALLOWED: ReadonlySet<LeadStatus> = new Set(["NEW", "NOT_HOME"]);

function leadStatusAllowsAmdVoicemail(status: string | null | undefined): boolean {
  return typeof status === "string" && AMD_VOICEMAIL_ALLOWED.has(status as LeadStatus);
}

/**
 * Find første ledige agent i en kampagne.
 * "Ledig" = AgentSession.status === "ready" og lastHeartbeat indenfor PRESENCE_FRESH_WINDOW_MS.
 *
 * Bruger Postgres `FOR UPDATE SKIP LOCKED` for at undgå at to dispatchere fanger samme agent.
 */
export async function reserveReadyAgent(params: {
  campaignId: string;
}): Promise<{ userId: string; sipUsername: string; sessionId: string } | null> {
  const cutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  // Vi laver en transaktion: find første ready agent og marker den som "ringing"
  // i én atomic operation så ingen anden dispatcher tager samme agent.
  const result = await prisma.$transaction(async (tx) => {
    // Hent alle ready agenter sorteret efter ældste heartbeat-update (jævn fordeling)
    const ready = await tx.agentSession.findMany({
      where: {
        campaignId: params.campaignId,
        status: "ready",
        lastHeartbeat: { gte: cutoff },
      },
      orderBy: { lastHeartbeat: "asc" },
      take: 5,
    });
    for (const session of ready) {
      // Marker som "ringing" — hvis det fejler (ramt af anden dispatcher) prøver vi næste.
      // updateMany returnerer count, så vi ved om vi vandt rasen.
      const updated = await tx.agentSession.updateMany({
        where: { id: session.id, status: "ready" },
        data: { status: "ringing" },
      });
      if (updated.count === 1) {
        const user = await tx.user.findUnique({
          where: { id: session.userId },
          select: { telnyxSipUsername: true },
        });
        if (user?.telnyxSipUsername) {
          return {
            userId: session.userId,
            sipUsername: user.telnyxSipUsername,
            sessionId: session.id,
          };
        }
        // Agent har ingen SIP — sæt tilbage til ready og prøv næste
        await tx.agentSession.update({
          where: { id: session.id },
          data: { status: "ready" },
        });
      }
    }
    return null;
  });
  return result;
}

/**
 * Sæt agent-session tilbage til "ready" (fx hvis bridge fejlede eller agenten lagde på).
 */
export async function releaseAgentSession(params: {
  sessionId: string;
  newStatus: "ready" | "wrap_up" | "offline";
}) {
  await prisma.agentSession.update({
    where: { id: params.sessionId },
    data: {
      status: params.newStatus,
      currentLeadCallControlId: null,
      currentAgentCallControlId: null,
      currentLeadId: null,
    },
  });
}

/**
 * Originate-and-bridge: ring agentens WebRTC SIP-URI op og kobl auto til lead'ets call.
 * Returnerer agent-call-control-id når Telnyx har accepteret originate.
 */
export async function originateBridgeToAgent(params: {
  apiKey: string;
  connectionId: string;
  agentSipUsername: string;
  fromNumber: string;
  leadCallControlId: string;
  campaignId: string;
  leadId: string;
  agentUserId: string;
  webhookUrl?: string;
}): Promise<{ ok: true; agentCallControlId: string } | { ok: false; message: string; status: number }> {
  const agentSip = buildTelnyxAgentSipUri(params.agentSipUsername);
  const clientState = encodeDialerClientState({
    v: 1,
    kind: "agent",
    campaignId: params.campaignId,
    leadId: params.leadId,
    userId: params.agentUserId,
    linkedCallControlId: params.leadCallControlId,
  });

  const dial = await dialTelnyxOutbound({
    connectionId: params.connectionId,
    from: params.fromNumber,
    to: agentSip,
    apiKey: params.apiKey,
    clientState,
    webhookUrl: params.webhookUrl,
    linkTo: params.leadCallControlId,
    timeoutSecs: 12,
  });

  if (!dial.ok) {
    return { ok: false, message: dial.message, status: dial.status };
  }
  return { ok: true, agentCallControlId: dial.callControlId };
}

/**
 * Trigger fra webhook'en når AMD-result = human.
 * Reservér agent → originate-and-bridge → opdater AgentSession + DialerCallLog.
 */
export async function handleAmdHuman(params: {
  apiKey: string;
  campaignId: string;
  leadId: string;
  leadCallControlId: string;
  webhookUrl?: string;
}): Promise<
  | { status: "bridged"; agentUserId: string }
  | { status: "no-agent" }
  | { status: "lead-gone" }
  | { status: "failed"; message: string }
> {
  // Safety: lead-leggen kan være lagt på i mellemtiden (race mellem AMD-result og hangup).
  // Tjek call-loggen før vi reserverer en agent.
  const leadLog = await prisma.dialerCallLog.findUnique({
    where: { callControlId: params.leadCallControlId },
    select: { state: true, endedAt: true },
  });
  if (!leadLog || leadLog.endedAt || leadLog.state === "hangup" || leadLog.state === "failed") {
    return { status: "lead-gone" };
  }

  const reserved = await reserveReadyAgent({ campaignId: params.campaignId });
  if (!reserved) {
    // Ingen ledig agent → drop opkaldet (abandon)
    await hangupTelnyxCall({
      apiKey: params.apiKey,
      callControlId: params.leadCallControlId,
    });
    await prisma.dialerCallLog.updateMany({
      where: { callControlId: params.leadCallControlId },
      data: { state: "failed", hangupCause: "no_agent_available", endedAt: new Date() },
    });
    return { status: "no-agent" };
  }

  const connectionId = getTelnyxConnectionId();
  if (!connectionId) {
    await releaseAgentSession({ sessionId: reserved.sessionId, newStatus: "ready" });
    return { status: "failed", message: "TELNYX_CONNECTION_ID mangler — kan ikke bridge" };
  }
  const fromNumber = pickTelnyxFromNumber(params.leadId, { userId: reserved.userId });
  if (!fromNumber) {
    await releaseAgentSession({ sessionId: reserved.sessionId, newStatus: "ready" });
    return { status: "failed", message: "TELNYX_FROM_NUMBER mangler — kan ikke bridge" };
  }

  const originate = await originateBridgeToAgent({
    apiKey: params.apiKey,
    connectionId,
    agentSipUsername: reserved.sipUsername,
    fromNumber,
    leadCallControlId: params.leadCallControlId,
    campaignId: params.campaignId,
    leadId: params.leadId,
    agentUserId: reserved.userId,
    webhookUrl: params.webhookUrl,
  });

  if (!originate.ok) {
    await releaseAgentSession({ sessionId: reserved.sessionId, newStatus: "ready" });
    await prisma.dialerCallLog.updateMany({
      where: { callControlId: params.leadCallControlId },
      data: {
        state: "failed",
        hangupCause: `originate_failed:${originate.message.slice(0, 80)}`,
      },
    });
    return { status: "failed", message: originate.message };
  }

  // Opdater AgentSession + log agent-leg
  await prisma.$transaction([
    prisma.agentSession.update({
      where: { id: reserved.sessionId },
      data: {
        currentLeadCallControlId: params.leadCallControlId,
        currentAgentCallControlId: originate.agentCallControlId,
        currentLeadId: params.leadId,
      },
    }),
    prisma.dialerCallLog.upsert({
      where: { callControlId: originate.agentCallControlId },
      create: {
        campaignId: params.campaignId,
        leadId: params.leadId,
        agentUserId: reserved.userId,
        callControlId: originate.agentCallControlId,
        direction: "outbound-agent",
        state: "initiated",
        bridgeTargetId: params.leadCallControlId,
        toNumber: buildTelnyxAgentSipUri(reserved.sipUsername),
      },
      update: {
        leadId: params.leadId,
        agentUserId: reserved.userId,
        bridgeTargetId: params.leadCallControlId,
      },
    }),
    prisma.dialerCallLog.updateMany({
      where: { callControlId: params.leadCallControlId },
      data: {
        agentUserId: reserved.userId,
        bridgeTargetId: originate.agentCallControlId,
      },
    }),
  ]);

  // Start optagelse på lead-leggen — kun nu hvor AMD har bekræftet menneske.
  // Dette sikrer at vi aldrig optager voicemail-beskeder.
  // Fire-and-forget: hvis recording fejler skal det ikke blokere bridge-flow.
  startTelnyxRecording({
    apiKey: params.apiKey,
    callControlId: params.leadCallControlId,
    format: "mp3",
    channels: "dual",
  }).then((rec) => {
    if (!rec.ok) {
      console.error("[dialer-bridge] startTelnyxRecording fejlede:", rec.message);
    }
  }).catch((err) => {
    console.error("[dialer-bridge] startTelnyxRecording exception:", err);
  });

  return { status: "bridged", agentUserId: reserved.userId };
}

/**
 * Trigger fra webhook'en når AMD-result = machine.
 * Hangup, marker lead som VOICEMAIL, frigør køen.
 *
 * Hvis agenten allerede har lukket leadet (NOT_INTERESTED, UNQUALIFIED, møde, callback m.m.),
 * må vi **ikke** overskrive status — ellers ender VOICEMAIL i 2t-cooldown og leadet kommer tilbage som NEW.
 * Vi lægger stadig på og rydder kø + call-log.
 */
export async function handleAmdMachine(params: {
  apiKey: string;
  campaignId: string;
  leadId: string;
  leadCallControlId: string;
}) {
  await hangupTelnyxCall({
    apiKey: params.apiKey,
    callControlId: params.leadCallControlId,
  });

  const leadRow = await prisma.lead.findUnique({
    where: { id: params.leadId },
    select: { status: true },
  });
  const allowVoicemailOutcome = leadStatusAllowsAmdVoicemail(leadRow?.status);

  const cleanupOps = [
    prisma.dialerCallLog.updateMany({
      where: { callControlId: params.leadCallControlId },
      data: {
        state: "machine",
        amdResult: "machine",
        endedAt: new Date(),
      },
    }),
    prisma.dialerQueueItem.deleteMany({
      where: { leadId: params.leadId, campaignId: params.campaignId },
    }),
  ];

  if (allowVoicemailOutcome) {
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: params.leadId },
        data: {
          status: "VOICEMAIL",
          voicemailMarkedAt: new Date(),
          lastOutcomeAt: new Date(),
        },
      }),
      prisma.leadOutcomeLog.create({
        data: {
          leadId: params.leadId,
          userId: null, // system-event (AMD)
          status: "VOICEMAIL",
        },
      }),
      ...cleanupOps,
    ]);
  } else {
    await prisma.$transaction(cleanupOps);
  }
}

/**
 * Læg alle igangværende predictive lead-ben (outbound-lead) på for et lead — fx når agenten sætter terminal udfald,
 * så AMD ikke kan lande efterfølgende og overskrive.
 */
export async function hangupActiveOutboundLeadLegsForLead(params: {
  apiKey: string;
  leadId: string;
}): Promise<void> {
  const open = await prisma.dialerCallLog.findMany({
    where: {
      leadId: params.leadId,
      direction: "outbound-lead",
      endedAt: null,
      state: { notIn: ["hangup", "failed"] },
    },
    select: { callControlId: true },
  });
  for (const row of open) {
    await hangupTelnyxCall({
      apiKey: params.apiKey,
      callControlId: row.callControlId,
    });
  }
}

/**
 * Bridge to live legs sammen — bruges ikke direkte når vi bruger link_to,
 * men kan fungere som fallback hvis link_to ikke triggede en auto-bridge.
 */
export async function bridgeIfBothAnswered(params: {
  apiKey: string;
  leadCallControlId: string;
  agentCallControlId: string;
}) {
  return bridgeTelnyxCalls({
    apiKey: params.apiKey,
    fromCallControlId: params.leadCallControlId,
    toCallControlId: params.agentCallControlId,
    parkAfterUnbridge: "self",
  });
}
