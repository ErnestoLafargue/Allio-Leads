/**
 * Live-coachens log: ét LiveCoachEvent pr. vist kort (latens, pris, 👍/👎) og månedsloftet for AI-kort.
 */
import { prisma } from "@/lib/prisma";

/** Version af live-coachens prompt og regler — gemmes på hvert kort. */
export const LIVE_COACH_PROMPT_VERSION = "lc16";

export function liveCoachMonthlyBudgetUsd(): number {
  const v = Number(process.env.LIVE_COACH_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 25;
}

export async function liveCoachSpentThisMonth(now = new Date()): Promise<number> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.liveCoachEvent.aggregate({ where: { createdAt: { gte: from } }, _sum: { costUsd: true } });
  return agg._sum.costUsd ?? 0;
}
