import { prisma } from "@/lib/prisma";

const LOCK_MS = 120_000;

/** Forhindrer parallel Podio-sync for samme lead (serverless race). */
export async function acquirePodioSyncLock(leadId: string): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(Date.now() + LOCK_MS);
  const result = await prisma.lead.updateMany({
    where: {
      id: leadId,
      OR: [{ podioSyncLockUntil: null }, { podioSyncLockUntil: { lt: now } }],
    },
    data: { podioSyncLockUntil: lockUntil },
  });
  return result.count > 0;
}

export async function releasePodioSyncLock(leadId: string): Promise<void> {
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: { podioSyncLockUntil: null },
    });
  } catch {
    /* lead slettet under sync */
  }
}
