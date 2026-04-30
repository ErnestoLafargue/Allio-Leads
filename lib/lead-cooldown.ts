import { prisma } from "@/lib/prisma";

const VOICEMAIL_MS = 2 * 60 * 60 * 1000;
const NOT_HOME_MS = 6 * 60 * 60 * 1000;

/**
 * Sætter leads med udløbet ventetid tilbage til NEW (kaldes før læsning af leads).
 * Opretter LeadOutcomeLog (userId null, status NEW) så scoreboard får episode-grænse ved genåbning i køen.
 *
 * Tilbagekald: rækker med planlagt genopkald må ikke auto-nulstilles af 2t/6t-reglen.
 */
export async function applyLeadCooldownResets(): Promise<void> {
  const now = Date.now();
  const voicemailCutoff = new Date(now - VOICEMAIL_MS);
  const notHomeCutoff = new Date(now - NOT_HOME_MS);
  const touchedAt = new Date();

  const toResetVm = await prisma.lead.findMany({
    where: {
      status: "VOICEMAIL",
      callbackScheduledFor: null,
      OR: [
        { voicemailMarkedAt: { lte: voicemailCutoff } },
        { AND: [{ voicemailMarkedAt: null }, { updatedAt: { lte: voicemailCutoff } }] },
      ],
    },
    select: { id: true },
  });
  if (toResetVm.length > 0) {
    // #region agent log
    fetch("http://localhost:7253/ingest/cae62791-9bb1-4500-92a8-c26abf2c0c90", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d38e61" }, body: JSON.stringify({ sessionId: "d38e61", runId: "voicemail-status-race-v1", hypothesisId: "H5", location: "lib/lead-cooldown.ts:voicemailReset", message: "voicemail cooldown reset triggered", data: { resetCount: toResetVm.length }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    const ids = toResetVm.map((l) => l.id);
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "NEW",
        voicemailMarkedAt: null,
        notHomeMarkedAt: null,
        updatedAt: touchedAt,
      },
    });
    await prisma.leadOutcomeLog.createMany({
      data: ids.map((leadId) => ({ leadId, userId: null, status: "NEW" })),
    });
  }

  const toResetNh = await prisma.lead.findMany({
    where: {
      status: "NOT_HOME",
      callbackScheduledFor: null,
      notHomeMarkedAt: { not: null, lte: notHomeCutoff },
    },
    select: { id: true },
  });
  if (toResetNh.length > 0) {
    const ids = toResetNh.map((l) => l.id);
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "NEW",
        voicemailMarkedAt: null,
        notHomeMarkedAt: null,
        updatedAt: touchedAt,
      },
    });
    await prisma.leadOutcomeLog.createMany({
      data: ids.map((leadId) => ({ leadId, userId: null, status: "NEW" })),
    });
  }

  await releaseStaleCallbacksToCampaignPool(touchedAt);
}

/**
 * Planlagt tilbagekald er overskredet, tildelte har været inde på leadet, men udfald er ikke ændret
 * (stadig CALLBACK_SCHEDULED + PENDING) → lead tilbage som «Ny» i kampagnekøen for alle.
 */
export async function releaseStaleCallbacksToCampaignPool(now: Date = new Date()): Promise<void> {
  const touchedAt = new Date();
  const toRelease = await prisma.lead.findMany({
    where: {
      status: "CALLBACK_SCHEDULED",
      callbackStatus: "PENDING",
      callbackScheduledFor: { not: null, lte: now },
      callbackSeenByAssigneeAt: { not: null },
    },
    select: { id: true },
  });
  if (toRelease.length === 0) return;

  const ids = toRelease.map((l) => l.id);
  await prisma.lead.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "NEW",
      callbackScheduledFor: null,
      callbackReservedByUserId: null,
      callbackStatus: "PENDING",
      callbackNote: "",
      callbackCreatedByUserId: null,
      callbackSeenByAssigneeAt: null,
      lockedByUserId: null,
      lockedAt: null,
      lockExpiresAt: null,
      updatedAt: touchedAt,
    },
  });
  await prisma.leadOutcomeLog.createMany({
    data: ids.map((leadId) => ({ leadId, userId: null, status: "NEW" })),
  });
}

/** Første gang tildelte åbner/reserverer lead med aktivt tilbagekald (bevares til genudlevering ved udløb). */
export async function markCallbackSeenByAssignee(leadId: string, assigneeUserId: string): Promise<void> {
  const seenAt = new Date();
  await prisma.$executeRaw`
    UPDATE "Lead"
    SET "callbackSeenByAssigneeAt" = COALESCE("callbackSeenByAssigneeAt", ${seenAt})
    WHERE "id" = ${leadId}
      AND "status" = 'CALLBACK_SCHEDULED'
      AND "callbackStatus" = 'PENDING'
      AND "callbackReservedByUserId" = ${assigneeUserId}
  `;
}
