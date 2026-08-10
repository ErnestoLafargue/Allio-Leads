import { prisma } from "@/lib/prisma";
import { MEETING_OUTCOME_PENDING, normalizeMeetingOutcomeStatus } from "@/lib/meeting-outcome";
import { applyMoederItemUpdate } from "@/lib/podio/moeder-item-update";

export const DEFAULT_RECONCILE_LIMIT = 50;
export const MAX_RECONCILE_LIMIT = 100;
export const RECONCILE_PAUSE_MS = 120;

export type ReconcileOutcomeError = {
  leadId: string;
  itemId?: number;
  error: string;
};

export type ReconcileOutcomesResult = {
  checked: number;
  updated: number;
  noop: number;
  ignored: number;
  errors: ReconcileOutcomeError[];
  limit: number;
};

type LeadCandidate = {
  id: string;
  podioItemId: string | null;
  meetingOutcomeStatus: string;
};

function parseItemId(raw: string | null | undefined): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isPendingOutcome(raw: string | null | undefined): boolean {
  return normalizeMeetingOutcomeStatus(raw) === MEETING_OUTCOME_PENDING;
}

export function clampReconcileLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_RECONCILE_LIMIT;
  return Math.min(MAX_RECONCILE_LIMIT, Math.max(1, Math.floor(raw)));
}

/** PENDING (inkl. tom) først — så manglende udfald synces før øvrige. */
export function prioritizePendingFirst(leads: LeadCandidate[]): LeadCandidate[] {
  const pending: LeadCandidate[] = [];
  const rest: LeadCandidate[] = [];
  for (const lead of leads) {
    if (isPendingOutcome(lead.meetingOutcomeStatus)) pending.push(lead);
    else rest.push(lead);
  }
  return [...pending, ...rest];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ReconcileOutcomesDeps = {
  findCandidates?: (limit: number) => Promise<LeadCandidate[]>;
  applyUpdate?: typeof applyMoederItemUpdate;
  pauseMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
};

async function defaultFindCandidates(limit: number): Promise<LeadCandidate[]> {
  const pending = await prisma.lead.findMany({
    where: {
      podioItemId: { not: null },
      meetingBookedAt: { not: null },
      OR: [{ meetingOutcomeStatus: MEETING_OUTCOME_PENDING }, { meetingOutcomeStatus: "" }],
    },
    select: { id: true, podioItemId: true, meetingOutcomeStatus: true },
    orderBy: { meetingScheduledFor: "desc" },
    take: limit,
  });

  if (pending.length >= limit) return pending;

  const pendingIds = new Set(pending.map((l) => l.id));
  const rest = await prisma.lead.findMany({
    where: {
      podioItemId: { not: null },
      meetingBookedAt: { not: null },
      NOT: {
        OR: [{ meetingOutcomeStatus: MEETING_OUTCOME_PENDING }, { meetingOutcomeStatus: "" }],
      },
    },
    select: { id: true, podioItemId: true, meetingOutcomeStatus: true },
    orderBy: { meetingScheduledFor: "desc" },
    take: limit - pending.length,
  });

  return [...pending, ...rest.filter((l) => !pendingIds.has(l.id))];
}

/**
 * Hent Podio-status for bookede møder med podioItemId og anvend i Allio.
 * Prioritér Afventende/PENDING, så manglende udfald synces først.
 */
export async function reconcilePodioMeetingOutcomesBatch(
  opts?: { limit?: number } & ReconcileOutcomesDeps,
): Promise<ReconcileOutcomesResult> {
  const limit = clampReconcileLimit(opts?.limit);
  const findCandidates = opts?.findCandidates ?? defaultFindCandidates;
  const applyUpdate = opts?.applyUpdate ?? applyMoederItemUpdate;
  const pauseMs = opts?.pauseMs ?? RECONCILE_PAUSE_MS;
  const sleepFn = opts?.sleepFn ?? sleep;

  const candidates = prioritizePendingFirst(await findCandidates(limit));

  const result: ReconcileOutcomesResult = {
    checked: 0,
    updated: 0,
    noop: 0,
    ignored: 0,
    errors: [],
    limit,
  };

  for (let i = 0; i < candidates.length; i++) {
    const lead = candidates[i]!;
    const itemId = parseItemId(lead.podioItemId);
    if (!itemId) {
      result.errors.push({ leadId: lead.id, error: "invalid podioItemId" });
      continue;
    }

    result.checked += 1;
    try {
      const sync = await applyUpdate(itemId);
      if (sync.ignored) {
        result.ignored += 1;
      } else if (!sync.action || sync.action === "noop" || sync.action === "none") {
        result.noop += 1;
      } else {
        result.updated += 1;
      }
    } catch (err) {
      result.errors.push({
        leadId: lead.id,
        itemId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (i < candidates.length - 1 && pauseMs > 0) {
      await sleepFn(pauseMs);
    }
  }

  return result;
}
