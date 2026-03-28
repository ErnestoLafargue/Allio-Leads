import { prisma } from "@/lib/prisma";
import { copenhagenDayKey } from "@/lib/copenhagen-day";

/** Kald ved vellykket login — idempotent for samme bruger samme kalenderdag. */
export async function recordUserLoginDay(userId: string) {
  const dayKey = copenhagenDayKey();
  await prisma.userLoginDay.upsert({
    where: { userId_dayKey: { userId, dayKey } },
    create: { userId, dayKey },
    update: {},
  });
}
