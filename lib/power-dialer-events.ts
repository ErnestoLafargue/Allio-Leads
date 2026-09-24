import { prisma } from "@/lib/prisma";
import type { DialerClientState, TelnyxWebhookPayload } from "@/lib/dialer-shared";
import { mapTelnyxAmdResult } from "@/lib/telnyx-amd-result";
import {
  handlePowerAgentAnswered,
  handlePowerAgentEnded,
  handlePowerLeadAmd,
  handlePowerLeadAnswered,
  handlePowerLeadEnded,
  handlePowerLegBridged,
  isPowerCampaign,
} from "@/lib/power-dialer-engine";
import {
  meetsAutoSyncTalkThreshold,
  scheduleLeadRecordingSync,
  talkSecondsFromCallTimestamps,
} from "@/lib/telnyx-recordings-auto-sync";

/** Call Control-events som Power Dialer-motoren håndterer (optagelser går stadig gennem call-events). */
export const POWER_EVENT_TYPES: ReadonlySet<string> = new Set([
  "call.initiated",
  "call.answered",
  "call.bridged",
  "call.hangup",
  "call.machine.detection.ended",
  "call.machine.premium.detection.ended",
  "call.machine.greeting.ended",
  "call.machine.premium.greeting.ended",
]);

export type PowerLegKind = "lead" | "agent";

/** Er dette et Power Dialer-ben — og i så fald lead- eller agent-benet? */
export async function resolvePowerLegKind(
  clientState: DialerClientState | null,
  existing: { campaignId: string; direction: string } | null,
): Promise<PowerLegKind | null> {
  if (clientState?.v === 2 && clientState.kind === "lead") {
    return clientState.dialMode === "POWER_DIALER" ? "lead" : null;
  }
  if (clientState?.v === 1 && clientState.kind === "agent") {
    return clientState.dialMode === "POWER_DIALER" ? "agent" : null;
  }
  if (clientState) return null;
  // Nogle events kan komme uden client_state — slå kampagnen op for kendte dialer-ben.
  if (existing && (existing.direction === "outbound-lead" || existing.direction === "outbound-agent")) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: existing.campaignId },
      select: { dialMode: true },
    });
    if (!isPowerCampaign(campaign)) return null;
    return existing.direction === "outbound-agent" ? "agent" : "lead";
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function processPowerDialerEvent(params: {
  kind: PowerLegKind;
  eventType: string;
  callControlId: string;
  payload: TelnyxWebhookPayload;
  queueItemId: string | null;
}): Promise<void> {
  const { kind, eventType, callControlId, payload } = params;
  switch (eventType) {
    case "call.initiated": {
      const sessionId = str(payload.call_session_id);
      if (sessionId) {
        await prisma.dialerCallLog.updateMany({
          where: { callControlId, callSessionId: null },
          data: { callSessionId: sessionId },
        });
      }
      return;
    }
    case "call.answered": {
      if (kind === "lead") await handlePowerLeadAnswered(callControlId);
      else await handlePowerAgentAnswered(callControlId);
      return;
    }
    case "call.bridged": {
      await handlePowerLegBridged(callControlId, kind);
      return;
    }
    case "call.machine.detection.ended":
    case "call.machine.premium.detection.ended": {
      if (kind === "lead") {
        await handlePowerLeadAmd(callControlId, mapTelnyxAmdResult(str(payload.result)), "detection");
      }
      return;
    }
    case "call.machine.greeting.ended":
    case "call.machine.premium.greeting.ended": {
      if (kind === "lead") {
        await handlePowerLeadAmd(callControlId, mapTelnyxAmdResult(str(payload.result)), "greeting");
      }
      return;
    }
    case "call.hangup": {
      const hangupCause = str(payload.hangup_cause);
      const hangupSource = str(payload.hangup_source);
      if (kind === "agent") {
        await handlePowerAgentEnded({ agentCallControlId: callControlId, hangupCause, hangupSource });
        return;
      }
      await handlePowerLeadEnded({
        leadCallControlId: callControlId,
        hangupCause,
        hangupSource,
        sipHangupCause: str(payload.sip_hangup_cause),
        queueItemId: params.queueItemId,
      });
      const log = await prisma.dialerCallLog.findUnique({
        where: { callControlId },
        select: { leadId: true, endedAt: true, bridgedAt: true, answeredAt: true },
      });
      if (log?.leadId && log.bridgedAt) {
        const talkSeconds = talkSecondsFromCallTimestamps({
          endedAt: log.endedAt ?? new Date(),
          bridgedAt: log.bridgedAt,
          answeredAt: log.answeredAt,
        });
        if (meetsAutoSyncTalkThreshold(talkSeconds)) {
          scheduleLeadRecordingSync(log.leadId, "hangup_long_call");
        }
      }
      return;
    }
    default:
      return;
  }
}
