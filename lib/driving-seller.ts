import { prisma } from "@/lib/prisma";

/**
 * Prisma-data når «Kørende sælger» slås til/fra: til → sidst i prioriteten (kan flyttes på
 * Administration → Booking), fra → ingen prioritet.
 */
export async function drivingSellerUpdate(
  isDrivingSeller: boolean,
  current?: { isDrivingSeller: boolean; sellerPriority: number | null },
): Promise<{ isDrivingSeller: boolean; sellerPriority: number | null }> {
  if (!isDrivingSeller) return { isDrivingSeller: false, sellerPriority: null };
  if (current?.isDrivingSeller && current.sellerPriority != null) {
    return { isDrivingSeller: true, sellerPriority: current.sellerPriority };
  }
  const last = await prisma.user.aggregate({
    where: { isDrivingSeller: true },
    _max: { sellerPriority: true },
  });
  return { isDrivingSeller: true, sellerPriority: (last._max.sellerPriority ?? 0) + 1 };
}
