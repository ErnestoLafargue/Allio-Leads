/**
 * Fælles afledning af lead/agent fra Telnyx-optagelse eller webhook-payload.
 * Bruges af call-events webhook og recordings-backfill så logikken ikke divergerer.
 */
import { prisma } from "@/lib/prisma";
import { normalizePhoneToE164ForDial, phoneStoredVariantsForQuery } from "@/lib/phone-e164";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { CALL_ATTEMPT_WINDOW, matchCallAttempt } from "@/lib/call-recording-linking";

export type TelnyxRecordingResolutionSource =
  | "client_state"
  | "call_control"
  | "call_session"
  | "bridge"
  | "call_attempt"
  | "phone"
  | "none";

/** Leads hvor telefon eller privatnummer er præcis dette nummer — dubletter giver flere. */
export async function findLeadIdsByNumber(raw: string | null): Promise<string[]> {
  const e164 = normalizePhoneToE164ForDial(raw ?? "");
  const digits = e164?.replace(/\D/g, "") ?? "";
  if (!digits) return [];
  const variants = phoneStoredVariantsForQuery(digits);
  const rows = await prisma.lead.findMany({
    where: { OR: [{ phone: { in: variants } }, { privatePhone: { in: variants } }] },
    select: { id: true, phone: true, privatePhone: true },
    take: 20,
  });
  const same = (p: string) => (normalizePhoneToE164ForDial(p)?.replace(/\D/g, "") ?? "") === digits;
  return rows.filter((r) => same(r.phone) || same(r.privatePhone)).map((r) => r.id);
}

/** Entydig lead via From/To — også brugt af WebRTC phone-fallback i call-events. */
export async function findUniqueLeadIdByCallParties(
  fromNumber: string | null,
  toNumber: string | null,
): Promise<string | null> {
  for (const raw of [toNumber, fromNumber]) {
    const ids = await findLeadIdsByNumber(raw);
    if (ids.length === 1) return ids[0]!;
  }
  return null;
}

/**
 * Leadet sælgeren ringede op lige før optagelsen startede. Sælgernes WebRTC-optagelser har
 * hverken client_state eller call_control_id, så uden dette mistes alle opkald til numre,
 * der findes på flere leads (samme virksomhed i flere kampagner).
 */
async function findLeadIdByCallAttempt(
  numbers: (string | null)[],
  startedAt: Date,
  agentUserId: string | null,
): Promise<{ leadId: string; userId: string | null } | null> {
  for (const raw of numbers) {
    const leadIds = await findLeadIdsByNumber(raw);
    if (leadIds.length === 0) continue;
    const attempts = await prisma.leadActivityEvent.findMany({
      where: {
        leadId: { in: leadIds },
        kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
        createdAt: {
          gte: new Date(startedAt.getTime() - CALL_ATTEMPT_WINDOW.beforeMs),
          lte: new Date(startedAt.getTime() + CALL_ATTEMPT_WINDOW.afterMs),
        },
      },
      select: { leadId: true, userId: true, createdAt: true },
    });
    const hit =
      matchCallAttempt(attempts, { startedAt, agentUserId }) ??
      (agentUserId ? matchCallAttempt(attempts, { startedAt, agentUserId: null }) : null);
    if (hit) return hit;
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
  /** Hvornår optagelsen startede — bruges til at finde sælgerens opkaldsforsøg. */
  startedAt?: Date | null;
  /** Sælgeren bag optagelsen, fx ud fra Telnyx-forbindelsen. */
  agentUserId?: string | null;
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

  if (params.startedAt) {
    const byAttempt = await findLeadIdByCallAttempt(
      [params.toNumber, params.fromNumber],
      params.startedAt,
      params.agentUserId ?? null,
    );
    if (byAttempt) {
      return {
        leadId: byAttempt.leadId,
        agentUserId: params.agentUserId ?? byAttempt.userId,
        resolutionSource: "call_attempt",
      };
    }
  }

  const byPhone = await findUniqueLeadIdByCallParties(params.toNumber, params.fromNumber);
  if (byPhone) {
    return { leadId: byPhone, agentUserId: params.agentUserId ?? null, resolutionSource: "phone" };
  }

  return {
    leadId: null,
    agentUserId: params.clientStateUserId ?? params.agentUserId ?? null,
    resolutionSource: "none",
  };
}
