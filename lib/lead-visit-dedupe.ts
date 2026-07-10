/** Minimum tid mellem to «åbnede leadet i arbejdskøen»-linjer for samme bruger+lead. */
export const LEAD_VISIT_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

type VisitLike = {
  visitedAt: Date;
  userId: string;
  leadId: string;
};

/**
 * Beholder én besøgslinje pr. 5-minutters «burst» for samme bruger+lead.
 * Sorterer ikke input — returnerer beholdte rækker i kronologisk rækkefølge.
 */
export function dedupeLeadVisits<T extends VisitLike>(visits: T[]): T[] {
  const sorted = [...visits].sort((a, b) => a.visitedAt.getTime() - b.visitedAt.getTime());
  const kept: T[] = [];
  const clusterStartByKey = new Map<string, Date>();

  for (const visit of sorted) {
    const key = `${visit.userId}:${visit.leadId}`;
    const clusterStart = clusterStartByKey.get(key);
    if (
      clusterStart &&
      visit.visitedAt.getTime() - clusterStart.getTime() <= LEAD_VISIT_DEDUPE_WINDOW_MS
    ) {
      continue;
    }
    kept.push(visit);
    clusterStartByKey.set(key, visit.visitedAt);
  }

  return kept;
}

export function isWithinLeadVisitDedupeWindow(
  previousVisitedAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - previousVisitedAt.getTime() <= LEAD_VISIT_DEDUPE_WINDOW_MS;
}
