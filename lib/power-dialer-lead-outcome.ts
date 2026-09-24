import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { shouldIncrementUnansweredAttempts } from "@/lib/lead-attempts";
import { shouldLogOutcomeForLeaderboard } from "@/lib/lead-outcome-log";
import { parsePowerDialerRequeueCooldownMs } from "@/lib/power-dialer-requeue";
import { powerLeadEffectFor, type PowerResolution } from "@/lib/power-dialer-outcomes";
import type { PowerDialerSettings } from "@/lib/power-dialer-settings";

/**
 * Skriv effekten af et afgjort Power-opkald på leadet (udfald, kontaktforsøg, cooldown).
 * Overskriver aldrig et udfald sat af en sælger: status ændres kun fra «Ny» (Telefonsvarer også fra
 * «Træffes ikke»), og opdateringen er betinget af den status, vi læste.
 */
export async function applyPowerLeadResolution(params: {
  leadId: string;
  resolution: PowerResolution;
  settings: PowerDialerSettings;
  unansweredCooldownHours: number;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const effect = powerLeadEffectFor(params.resolution, {
    amdMachineCountsAttempt: params.settings.amdMachineCountsAttempt,
    unansweredCooldownHours: params.unansweredCooldownHours,
    requeueCooldownMs: parsePowerDialerRequeueCooldownMs(),
  });
  if (!effect.status && effect.eligibleAfterMs === null && !effect.activitySummary) return;

  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    select: { status: true, meetingBookedAt: true },
  });
  if (!lead) return;

  const data: Prisma.LeadUpdateManyMutationInput = {};
  let logStatus: string | null = null;
  const canSetStatus =
    effect.status === "NOT_HOME"
      ? lead.status === "NEW"
      : effect.status === "VOICEMAIL"
        ? lead.status === "NEW" || lead.status === "NOT_HOME"
        : false;

  if (effect.status && canSetStatus) {
    data.status = effect.status;
    data.lastOutcomeAt = now;
    if (effect.status === "NOT_HOME") {
      data.notHomeMarkedAt = now;
      data.voicemailMarkedAt = null;
    } else {
      data.voicemailMarkedAt = now;
      data.notHomeMarkedAt = null;
    }
    if (effect.countAttempt && shouldIncrementUnansweredAttempts(lead, effect.status)) {
      data.unansweredAttempts = { increment: 1 };
    }
    if (shouldLogOutcomeForLeaderboard(lead, effect.status)) logStatus = effect.status;
  }
  if (effect.eligibleAfterMs !== null) {
    data.powerDialerEligibleAfter = new Date(now.getTime() + effect.eligibleAfterMs);
  }
  if (Object.keys(data).length === 0 && !effect.activitySummary) return;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      const res = await tx.lead.updateMany({
        where: { id: params.leadId, status: lead.status },
        data,
      });
      if (res.count !== 1) return;
    }
    if (logStatus) {
      await tx.leadOutcomeLog.create({
        data: { leadId: params.leadId, userId: null, status: logStatus },
      });
    }
    if (effect.activitySummary) {
      await tx.leadActivityEvent.create({
        data: {
          leadId: params.leadId,
          userId: null,
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          summary: effect.activitySummary,
        },
      });
    }
  });
}
