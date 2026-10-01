import { prisma } from "@/lib/prisma";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  applyOccupancyCredit,
  type DialerLinePhase,
} from "@/lib/dialer-line-phase";

export {
  applyOccupancyCredit,
  isDialerLinePhase,
  linePhaseFromAgentStatus,
  linePhaseFromVoipStatus,
  MAX_LINE_OCCUPANCY_CREDIT_SECONDS,
  occupancyDeltaSeconds,
  type DialerLinePhase,
} from "@/lib/dialer-line-phase";

/**
 * Kreditér sælgerens egen linje (ring + tale) på kampagnen for i dag.
 * Kaldes fra Power/Predictive-presence og fra heartbeat med klientens linje-fase.
 */
export async function creditDialerLineOccupancy(params: {
  userId: string;
  campaignId: string;
  phase: DialerLinePhase | null;
  now?: Date;
}): Promise<void> {
  const campaignId = params.campaignId.trim();
  if (!campaignId) return;
  const now = params.now ?? new Date();
  const dayKey = copenhagenDayKey(now);

  const existing = await prisma.userCampaignPresenceDay.findUnique({
    where: { userId_campaignId_dayKey: { userId: params.userId, campaignId, dayKey } },
    select: {
      ringSeconds: true,
      talkLineSeconds: true,
      linePhase: true,
      lineLastSeenAt: true,
    },
  });

  const next = applyOccupancyCredit({
    ringSeconds: existing?.ringSeconds ?? 0,
    talkLineSeconds: existing?.talkLineSeconds ?? 0,
    linePhase: existing?.linePhase ?? null,
    lineLastSeenAt: existing?.lineLastSeenAt ?? null,
    nextPhase: params.phase,
    now,
  });

  await prisma.userCampaignPresenceDay.upsert({
    where: { userId_campaignId_dayKey: { userId: params.userId, campaignId, dayKey } },
    create: {
      userId: params.userId,
      campaignId,
      dayKey,
      dialerSeconds: 0,
      ringSeconds: next.ringSeconds,
      talkLineSeconds: next.talkLineSeconds,
      linePhase: next.linePhase,
      lineLastSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      ringSeconds: next.ringSeconds,
      talkLineSeconds: next.talkLineSeconds,
      linePhase: next.linePhase,
      lineLastSeenAt: now,
    },
  });
}
