/**
 * Fælles afledning af lead/agent fra Telnyx-optagelse eller webhook-payload.
 * Bruges af call-events webhook og recordings-backfill så logikken ikke divergerer.
 */
import { prisma } from "@/lib/prisma";
import { normalizePhoneToE164ForDial, phoneStoredVariantsForQuery } from "@/lib/phone-e164";

export type TelnyxRecordingResolutionSource =
  | "client_state"
  | "call_control"
  | "call_session"
  | "bridge"
  | "phone"
  | "none";

/** Entydig lead via From/To — også brugt af WebRTC phone-fallback i call-events. */
export async function findUniqueLeadIdByCallParties(
  fromNumber: string | null,
  toNumber: string | null,
): Promise<string | null> {
  for (const raw of [toNumber, fromNumber]) {
    const e164 = normalizePhoneToE164ForDial(raw ?? "");
    const digits = e164?.replace(/\D/g, "") ?? "";
    if (!digits) continue;
    const variants = phoneStoredVariantsForQuery(digits);
    const matches = await prisma.lead.findMany({
      where: { phone: { in: variants } },
      select: { id: true, phone: true },
      take: 8,
    });
    const exact = matches.filter((m) => {
      const md = normalizePhoneToE164ForDial(m.phone)?.replace(/\D/g, "") ?? "";
      return md === digits;
    });
    if (exact.length === 1) {
      return exact[0]!.id;
    }
  }
  return null;
}

export async function resolveLeadContextForTelnyxRecording(params: {
  callControlId: string | null;
  callSessionId: string | null;
  clientStateLeadId: string | null;
  clientStateUserId: string | null;
  fromNumber: string | null;
  toNumber: string | null;
}): Promise<{
  leadId: string | null;
  agentUserId: string | null;
  resolutionSource: TelnyxRecordingResolutionSource;
}> {
  if (params.clientStateLeadId) {
    return {
      leadId: params.clientStateLeadId,
      agentUserId: params.clientStateUserId,
      resolutionSource: "client_state",
    };
  }

  const byControl = params.callControlId
    ? await prisma.dialerCallLog.findUnique({
        where: { callControlId: params.callControlId },
        select: { leadId: true, agentUserId: true, bridgeTargetId: true },
      })
    : null;

  if (byControl?.leadId) {
    return {
      leadId: byControl.leadId,
      agentUserId: byControl.agentUserId ?? null,
      resolutionSource: "call_control",
    };
  }

  if (params.callSessionId) {
    const sessionRows = await prisma.dialerCallLog.findMany({
      where: { callSessionId: params.callSessionId, leadId: { not: null } },
      select: { leadId: true, agentUserId: true, direction: true },
      orderBy: { startedAt: "desc" },
    });
    if (sessionRows.length > 0) {
      const leadIds = new Set(sessionRows.map((r) => r.leadId!));
      if (leadIds.size === 1) {
        const row =
          sessionRows.find((r) => r.direction === "outbound-lead") ?? sessionRows[0]!;
        return {
          leadId: row.leadId!,
          agentUserId: row.agentUserId ?? null,
          resolutionSource: "call_session",
        };
      }
    }
  }

  if (params.callControlId) {
    const byBridge = await prisma.dialerCallLog.findFirst({
      where: {
        OR: [
          { bridgeTargetId: params.callControlId },
          { callControlId: byControl?.bridgeTargetId ?? "__none__" },
        ],
        leadId: { not: null },
      },
      orderBy: { startedAt: "desc" },
      select: { leadId: true, agentUserId: true },
    });
    if (byBridge?.leadId) {
      return {
        leadId: byBridge.leadId,
        agentUserId: byBridge.agentUserId ?? null,
        resolutionSource: "bridge",
      };
    }
  }

  const byPhone = await findUniqueLeadIdByCallParties(params.toNumber, params.fromNumber);
  if (byPhone) {
    return { leadId: byPhone, agentUserId: null, resolutionSource: "phone" };
  }

  return {
    leadId: null,
    agentUserId: params.clientStateUserId,
    resolutionSource: "none",
  };
}
