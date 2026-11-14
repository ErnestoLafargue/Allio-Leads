import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAllioEmployeeForSeller } from "@/lib/allio-native/employees";

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

/**
 * Efter svaret: giv en (ny) kørende sælger en kalender i Allio — en passende eksisterende eller en ny
 * uden login. Allios API kan være flere sekunder om det, så det må ikke holde brugeren hen.
 */
export function ensureAllioCalendarAfterResponse(userId: string): void {
  after(async () => {
    try {
      await ensureAllioEmployeeForSeller(userId);
    } catch (err) {
      console.error(
        `[driving-seller] Allio-kalender for user=${userId} fejlede:`,
        err instanceof Error ? err.message : err,
      );
    }
  });
}
