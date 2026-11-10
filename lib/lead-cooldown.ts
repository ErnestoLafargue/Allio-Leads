import { prisma } from "@/lib/prisma";
import {
  DEFAULT_UNANSWERED_COOLDOWN_HOURS,
  isUnansweredCooldownExpired,
  normalizeUnansweredCooldownHours,
} from "@/lib/lead-attempts";

type LeadCooldownCandidate = {
  id: string;
  voicemailMarkedAt: Date | null;
  notHomeMarkedAt: Date | null;
  updatedAt: Date;
  campaign: { unansweredCooldownHours: number } | null;
};

function cooldownHoursForLead(lead: LeadCooldownCandidate): number {
  return normalizeUnansweredCooldownHours(
    lead.campaign?.unansweredCooldownHours ?? DEFAULT_UNANSWERED_COOLDOWN_HOURS,
  );
}

/**
 * Sætter leads med udløbet ventetid tilbage til NEW (kaldes før læsning af leads).
 * Cooldown evalueres **pr. kampagne** — dubletter på tværs af kampagner med forskellige
 * cooldown-tider kan blive ringbare uafhængigt.
 *
 * Opretter LeadOutcomeLog (userId null, status NEW) så scoreboard får episode-grænse ved genåbning i køen.
 *
 * Tilbagekald: rækker med planlagt genopkald må ikke auto-nulstilles af cooldown-reglen. Et aktivt
 * tilbagekald frigives heller aldrig automatisk, når tidspunktet er passeret — det forbliver låst
 * til den tildelte sælger, indtil udfaldet ændres (se lib/lead-callback-access.ts).
 */
export async function applyLeadCooldownResets(): Promise<void> {
  const nowMs = Date.now();
  const touchedAt = new Date();

  const vmCandidates = await prisma.lead.findMany({
    where: {
      status: "VOICEMAIL",
      callbackScheduledFor: null,
    },
    select: {
      id: true,
      voicemailMarkedAt: true,
      notHomeMarkedAt: true,
      updatedAt: true,
      campaign: { select: { unansweredCooldownHours: true } },
    },
  });

  const toResetVm = vmCandidates.filter((lead) => {
    const markedAt = lead.voicemailMarkedAt ?? lead.updatedAt;
    return isUnansweredCooldownExpired(markedAt, cooldownHoursForLead(lead), nowMs);
  });

  if (toResetVm.length > 0) {
    const ids = toResetVm.map((l) => l.id);
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "NEW",
        voicemailMarkedAt: null,
        notHomeMarkedAt: null,
        dialFailoverPendingE164: "",
        updatedAt: touchedAt,
      },
    });
    await prisma.lead.updateMany({
      where: { id: { in: ids }, lastOutcomeAt: null },
      data: { lastOutcomeAt: touchedAt },
    });
    await prisma.leadOutcomeLog.createMany({
      data: ids.map((leadId) => ({ leadId, userId: null, status: "NEW" })),
    });
  }

  const nhCandidates = await prisma.lead.findMany({
    where: {
      status: "NOT_HOME",
      callbackScheduledFor: null,
      notHomeMarkedAt: { not: null },
    },
    select: {
      id: true,
      voicemailMarkedAt: true,
      notHomeMarkedAt: true,
      updatedAt: true,
      campaign: { select: { unansweredCooldownHours: true } },
    },
  });

  const toResetNh = nhCandidates.filter((lead) => {
    const markedAt = lead.notHomeMarkedAt ?? lead.updatedAt;
    return isUnansweredCooldownExpired(markedAt, cooldownHoursForLead(lead), nowMs);
  });

  if (toResetNh.length > 0) {
    const ids = toResetNh.map((l) => l.id);
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "NEW",
        voicemailMarkedAt: null,
        notHomeMarkedAt: null,
        dialFailoverPendingE164: "",
        updatedAt: touchedAt,
      },
    });
    await prisma.lead.updateMany({
      where: { id: { in: ids }, lastOutcomeAt: null },
      data: { lastOutcomeAt: touchedAt },
    });
    await prisma.leadOutcomeLog.createMany({
      data: ids.map((leadId) => ({ leadId, userId: null, status: "NEW" })),
    });
  }
}

/** Første gang tildelte åbner/reserverer lead med aktivt tilbagekald (kun registrering — frigiver ikke leadet). */
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
