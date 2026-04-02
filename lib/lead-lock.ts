import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Maks. tid uden heartbeat (seneste aktivitet på `lockedAt`) før lås frigives.
 * Override: LEAD_LOCK_MAX_IDLE_SECONDS (60–28800). I browser: NEXT_PUBLIC_* matcher server ved build.
 * Legacy: LEAD_LOCK_TTL_SECONDS bruges som fallback hvis MAX_IDLE ikke er sat.
 */
export function getLeadLockMaxIdleMs(): number {
  const raw = parseInt(
    process.env.LEAD_LOCK_MAX_IDLE_SECONDS ??
      process.env.NEXT_PUBLIC_LEAD_LOCK_MAX_IDLE_SECONDS ??
      process.env.LEAD_LOCK_TTL_SECONDS ??
      "900",
    10,
  );
  const sec = Number.isFinite(raw) ? Math.min(Math.max(raw, 60), 28_800) : 900;
  return sec * 1000;
}

/** @deprecated Brug getLeadLockMaxIdleMs — samme værdi. */
export function getLeadLockTtlMs(): number {
  return getLeadLockMaxIdleMs();
}

export const LEAD_LOCK_CLEAR: Pick<
  Prisma.LeadUncheckedUpdateInput,
  "lockedByUserId" | "lockedAt" | "lockExpiresAt"
> = {
  lockedByUserId: null,
  lockedAt: null,
  lockExpiresAt: null,
};

export type LeadLockFields = {
  lockedByUserId: string | null;
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
};

/**
 * Aktivt lås: ejer sat og (seneste aktivitet inden for idle-vindue ELLER glide-lease stadig gyldig).
 * Legacy-rækker kan have `lockExpiresAt` i fremtiden mens `lockedAt` mangler — tælles stadig som aktive.
 */
export function isLockActive(lead: LeadLockFields, now: Date = new Date()): boolean {
  if (!lead.lockedByUserId) return false;
  const idleMs = getLeadLockMaxIdleMs();
  if (lead.lockedAt && now.getTime() - lead.lockedAt.getTime() < idleMs) return true;
  if (lead.lockExpiresAt && lead.lockExpiresAt.getTime() > now.getTime()) return true;
  return false;
}

/** Sandt når en anden bruger har et gyldigt lås. */
export function isLockedByOtherUser(
  lead: LeadLockFields,
  userId: string,
  now: Date = new Date(),
): boolean {
  if (!isLockActive(lead, now)) return false;
  return lead.lockedByUserId !== userId;
}

/**
 * Atomisk: sæt lås hvis lead er ledigt, udløbet, eller allerede ejet af samme bruger.
 * Returnerer true hvis præcis én række blev opdateret.
 */
export async function tryAcquireLeadLock(
  db: PrismaClient | Prisma.TransactionClient,
  leadId: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const idleMs = getLeadLockMaxIdleMs();
  const staleCutoff = new Date(now.getTime() - idleMs);
  const expires = new Date(now.getTime() + idleMs);
  /** Kan overtage fra anden bruger kun når lås ikke længere er aktivt (matcher isLockActive). */
  const inactiveLease = {
    AND: [
      { OR: [{ lockedAt: null }, { lockedAt: { lt: staleCutoff } }] },
      { OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lte: now } }] },
    ],
  } as const;
  const res = await db.lead.updateMany({
    where: {
      id: leadId,
      OR: [
        { lockedByUserId: null },
        { lockedByUserId: userId },
        inactiveLease,
        { lockedAt: null, lockExpiresAt: { lt: now } },
        { lockedByUserId: { not: null }, lockedAt: null, lockExpiresAt: null },
      ],
    },
    data: {
      lockedByUserId: userId,
      lockedAt: now,
      lockExpiresAt: expires,
    },
  });
  return res.count === 1;
}

/** Forlæng lås når brugeren stadig har et gyldigt lås. */
export async function refreshLeadLock(
  db: PrismaClient | Prisma.TransactionClient,
  leadId: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const idleMs = getLeadLockMaxIdleMs();
  const staleCutoff = new Date(now.getTime() - idleMs);
  const expires = new Date(now.getTime() + idleMs);
  const extended = await db.lead.updateMany({
    where: {
      id: leadId,
      lockedByUserId: userId,
      OR: [
        { lockExpiresAt: { gt: now } },
        { lockedAt: { gte: staleCutoff } },
        { lockedAt: null, lockExpiresAt: { gt: now } },
      ],
    },
    data: {
      lockedAt: now,
      lockExpiresAt: expires,
    },
  });
  if (extended.count === 1) return true;
  return tryAcquireLeadLock(db, leadId, userId, now);
}

/** Frigiv lås. Admin kan sætte opts.admin for at fjerne uanset ejer. */
export async function releaseLeadLock(
  db: PrismaClient | Prisma.TransactionClient,
  leadId: string,
  userId: string,
  opts?: { admin?: boolean },
): Promise<void> {
  if (opts?.admin) {
    await db.lead.updateMany({
      where: { id: leadId },
      data: {
        lockedByUserId: null,
        lockedAt: null,
        lockExpiresAt: null,
      },
    });
    return;
  }
  await db.lead.updateMany({
    where: { id: leadId, lockedByUserId: userId },
    data: {
      lockedByUserId: null,
      lockedAt: null,
      lockExpiresAt: null,
    },
  });
}

export async function releaseExpiredLocksEverywhere(db: PrismaClient, now: Date = new Date()): Promise<number> {
  const idleMs = getLeadLockMaxIdleMs();
  const staleCutoff = new Date(now.getTime() - idleMs);
  const inactiveLease = {
    AND: [
      { OR: [{ lockedAt: null }, { lockedAt: { lt: staleCutoff } }] },
      { OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lte: now } }] },
    ],
  } as const;
  const res = await db.lead.updateMany({
    where: {
      lockedByUserId: { not: null },
      OR: [
        inactiveLease,
        { lockedByUserId: { not: null }, lockedAt: null, lockExpiresAt: null },
      ],
    },
    data: {
      lockedByUserId: null,
      lockedAt: null,
      lockExpiresAt: null,
    },
  });
  return res.count;
}

export function sellerMayEditLead(
  role: string,
  userId: string,
  lead: LeadLockFields,
  now: Date = new Date(),
): boolean {
  if (role === "ADMIN") return true;
  if (!isLockActive(lead, now)) return true;
  return lead.lockedByUserId === userId;
}
