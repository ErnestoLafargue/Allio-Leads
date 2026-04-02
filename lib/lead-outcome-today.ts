import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtc } from "@/lib/copenhagen-day";

/**
 * Lead-id'er der har mindst ét LeadOutcomeLog i dag (Europe/Copenhagen).
 */
export async function getLeadIdsWithOutcomeLogToday(
  leadIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();

  const { start, end } = copenhagenDayBoundsUtc(now);

  const rows = await prisma.leadOutcomeLog.groupBy({
    by: ["leadId"],
    where: {
      leadId: { in: leadIds },
      createdAt: { gte: start, lt: end },
    },
  });

  return new Set(rows.map((r) => r.leadId));
}
