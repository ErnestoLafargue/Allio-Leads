import { prisma } from "@/lib/prisma";

const LOCK_TTL_MS = 120_000;

/** Kort lås mens Allio-Leads skriver til Native — webhook echo ignoreres. */
export async function acquireAllioNativeSyncLock(leadId: string): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + LOCK_TTL_MS);
  const result = await prisma.lead.updateMany({
    where: {
      id: leadId,
      OR: [{ allioNativeSyncLockUntil: null }, { allioNativeSyncLockUntil: { lt: now } }],
    },
    data: { allioNativeSyncLockUntil: until },
  });
  return result.count > 0;
}

export async function releaseAllioNativeSyncLock(leadId: string): Promise<void> {
  await prisma.lead.updateMany({
    where: { id: leadId },
    data: { allioNativeSyncLockUntil: null },
  });
}

export async function isAllioNativeSyncLocked(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { allioNativeSyncLockUntil: true },
  });
  if (!lead?.allioNativeSyncLockUntil) return false;
  return lead.allioNativeSyncLockUntil.getTime() > Date.now();
}
