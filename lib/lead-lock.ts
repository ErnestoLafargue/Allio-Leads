import type { Prisma, PrismaClient } from "@prisma/client";

/** Standard 180 s (3 min). Override med LEAD_LOCK_TTL_SECONDS (60–900). */
export function getLeadLockTtlMs(): number {
  const raw = parseInt(process.env.LEAD_LOCK_TTL_SECONDS ?? "180", 10);
  const sec = Number.isFinite(raw) ? Math.min(Math.max(raw, 60), 900) : 180;
  return sec * 1000;
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

export function isLockActive(lead: LeadLockFields, now: Date = new Date()): boolean {
  return Boolean(
    lead.lockedByUserId &&
      lead.lockExpiresAt &&
      lead.lockExpiresAt.getTime() > now.getTime(),
  );
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
  const ttl = getLeadLockTtlMs();
  const expires = new Date(now.getTime() + ttl);
  const res = await db.lead.updateMany({
    where: {
      id: leadId,
      OR: [
        { lockedByUserId: null },
        { lockExpiresAt: { lt: now } },
        { lockedByUserId: userId },
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
  const ttl = getLeadLockTtlMs();
  const expires = new Date(now.getTime() + ttl);
  const extended = await db.lead.updateMany({
    where: {
      id: leadId,
      lockedByUserId: userId,
      lockExpiresAt: { gt: now },
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
  const res = await db.lead.updateMany({
    where: {
      lockExpiresAt: { not: null, lt: now },
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
