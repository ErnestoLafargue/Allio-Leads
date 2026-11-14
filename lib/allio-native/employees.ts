import { prisma } from "@/lib/prisma";
import {
  createEmployee,
  isAllioNativeConfigured,
  listEmployees,
  sleep,
} from "@/lib/allio-native/client";
import {
  matchEmployeeForSeller,
  matchSellerForEmployee,
  normalizeName,
  type EmployeeForMatch,
} from "@/lib/allio-native/employee-match";

/**
 * Kobling mellem sælgere i Allio-Leads og kalendere (medarbejdere) i Allio-Native.
 *
 * - Allio → Leads: employee.created/updated-webhooks kobler kalenderen til den sælger, den passer på.
 * - Leads → Allio: når en bruger bliver kørende sælger uden kalender, findes eller oprettes en i Allio.
 */

const sellerSelect = { id: true, name: true, phone: true, allioNativeEmployeeId: true } as const;

/** employee.created / employee.updated: kobl kalenderen til sælgeren, hvis ingen allerede har den. */
export async function linkAllioEmployee(employee: EmployeeForMatch): Promise<{ linkedUserId?: string }> {
  if (!employee.id) return {};
  const already = await prisma.user.findFirst({ where: { allioNativeEmployeeId: employee.id }, select: { id: true } });
  if (already) return {};

  const sellers = await prisma.user.findMany({ select: sellerSelect });
  const seller = matchSellerForEmployee(sellers, employee);
  if (!seller) return {};
  await prisma.user.update({ where: { id: seller.id }, data: { allioNativeEmployeeId: employee.id } });
  return { linkedUserId: seller.id };
}

/** employee.deleted: fjern koblingen, så møderne falder tilbage til standard-kalenderen. */
export async function unlinkAllioEmployee(employeeId: string): Promise<{ unlinked: number }> {
  if (!employeeId) return { unlinked: 0 };
  const res = await prisma.user.updateMany({
    where: { allioNativeEmployeeId: employeeId },
    data: { allioNativeEmployeeId: null },
  });
  return { unlinked: res.count };
}

/** Ydelserne, Leads booker (Online/Fysisk møde), så den nye kalender kan bookes med det samme. */
function leadsServiceIds(): string[] {
  return [process.env.ALLIO_SERVICE_ID_ONLINE, process.env.ALLIO_SERVICE_ID_PHYSICAL]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
}

/**
 * Kørende sælger uden kalender: kobl til en passende kalender i Allio, ellers opret en (uden login).
 * Returnerer kalenderens id, eller null hvis sælgeren ikke skal have en.
 */
export async function ensureAllioEmployeeForSeller(userId: string): Promise<string | null> {
  if (!isAllioNativeConfigured()) return null;
  const seller = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...sellerSelect, isDrivingSeller: true },
  });
  if (!seller || !seller.isDrivingSeller) return null;
  if (seller.allioNativeEmployeeId) return seller.allioNativeEmployeeId;

  const taken = new Set(
    (
      await prisma.user.findMany({
        where: { allioNativeEmployeeId: { not: null } },
        select: { allioNativeEmployeeId: true },
      })
    ).map((u) => u.allioNativeEmployeeId as string),
  );

  const link = async (employeeId: string) => {
    await prisma.user.update({ where: { id: seller.id }, data: { allioNativeEmployeeId: employeeId } });
    return employeeId;
  };

  const existing = matchEmployeeForSeller(await listEmployees(), seller, taken);
  if (existing) return link(existing.id);

  try {
    const created = await createEmployee({
      name: seller.name,
      phone: seller.phone,
      service_ids: leadsServiceIds(),
    });
    return link(created.id);
  } catch (err) {
    // Allios gateway kan give op, selvom kalenderen blev oprettet: find den på navnet.
    if (!(err as { transient?: boolean }).transient) throw err;
    for (const wait of [2000, 4000, 6000]) {
      await sleep(wait);
      const found = (await listEmployees()).find(
        (e) => !taken.has(e.id) && normalizeName(e.name) === normalizeName(seller.name),
      );
      if (found) return link(found.id);
    }
    throw err;
  }
}
