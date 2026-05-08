import type { PrismaClient } from "@prisma/client";

export const POWER_DIALER_REQUEUE_COOLDOWN_MS_DEFAULT = 10 * 60 * 1000;

/** Minutter — default 10 hvis env mangler eller er ugyldig. */
export function parsePowerDialerRequeueCooldownMs(): number {
  const raw = process.env.POWER_DIALER_REQUEUE_COOLDOWN_MINUTES?.trim();
  if (!raw) return POWER_DIALER_REQUEUE_COOLDOWN_MS_DEFAULT;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return POWER_DIALER_REQUEUE_COOLDOWN_MS_DEFAULT;
  return Math.round(n * 60 * 1000);
}

/**
 * Efter usikkert AMD eller no-bridge hangup i Power Dialer: lead forbliver NEW,
 * flyttes effektivt bagerst via lastDialAttemptAt + kø-cooldown via powerDialerEligibleAfter.
 */
export async function requeuePowerDialerLeadAfterNonBridge(
  db: PrismaClient,
  params: { leadId: string },
): Promise<void> {
  const cooldownMs = parsePowerDialerRequeueCooldownMs();
  const eligible = new Date(Date.now() + cooldownMs);
  const now = new Date();
  await db.lead.update({
    where: { id: params.leadId },
    data: {
      powerDialerEligibleAfter: eligible,
      lastDialAttemptAt: now,
    },
  });
}
