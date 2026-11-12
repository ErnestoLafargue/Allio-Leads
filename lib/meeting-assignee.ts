import { prisma } from "@/lib/prisma";

export type DrivingSeller = {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  sellerPriority: number | null;
  podioSellerItemId: number | null;
  allioNativeEmployeeId: string | null;
};

const SELLER_SELECT = {
  id: true,
  name: true,
  username: true,
  phone: true,
  sellerPriority: true,
  podioSellerItemId: true,
  allioNativeEmployeeId: true,
} as const;

function isVictor(u: { name: string; username: string }): boolean {
  const uname = u.username.trim().toLowerCase();
  const name = u.name.trim().toLowerCase();
  return uname === "victor@allio.dk" || name === "victor lafargue";
}

/** Sortér efter prioritet (1 først, uden prioritet sidst), derefter navn. */
export function sortByPriority<T extends { sellerPriority: number | null; name: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (a.sellerPriority ?? Number.MAX_SAFE_INTEGER) - (b.sellerPriority ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, "da"),
  );
}

/**
 * Kørende sælgere i prioriteret rækkefølge — de har kalender og kan få tildelt møder.
 * Er ingen sat op endnu, bruges Victor (tidligere fast mødeansvarlig) som nødløsning.
 */
export async function listDrivingSellers(): Promise<DrivingSeller[]> {
  const rows = await prisma.user.findMany({
    where: { isDrivingSeller: true },
    select: SELLER_SELECT,
  });
  if (rows.length > 0) return sortByPriority(rows);
  const fallback = await prisma.user.findMany({ select: SELLER_SELECT });
  return fallback.filter(isVictor);
}

/** Brugere der kan tildeles møder (Kommende møder, blokeringer) = kørende sælgere. */
export async function listMeetingAssignableUsers(): Promise<DrivingSeller[]> {
  return listDrivingSellers();
}

/**
 * Alle brugere, en blokering kan tilhøre: kørende sælgere først (efter prioritet), derefter resten
 * efter navn. Blokeringer hos andre end kørende sælgere påvirker ikke ledige booking-tider.
 */
export async function listBlockedTimeOwners(): Promise<{ id: string; name: string; username: string }[]> {
  const rows = await prisma.user.findMany({
    select: { id: true, name: true, username: true, isDrivingSeller: true, sellerPriority: true },
  });
  const drivers = sortByPriority(rows.filter((u) => u.isDrivingSeller));
  const others = rows
    .filter((u) => !u.isDrivingSeller)
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
  return [...drivers, ...others].map(({ id, name, username }) => ({ id, name, username }));
}

/** Sælger nr. 1 — bruges når der ikke kan vælges ud fra kalenderen. */
export async function getDefaultMeetingAssigneeId(): Promise<string | null> {
  return (await listDrivingSellers())[0]?.id ?? null;
}

export async function requireDefaultMeetingAssigneeId(): Promise<string> {
  const id = await getDefaultMeetingAssigneeId();
  if (!id) {
    throw new Error("Ingen kørende sælger er sat op — markér mindst én bruger som kørende sælger.");
  }
  return id;
}
