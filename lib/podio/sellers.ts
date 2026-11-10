/**
 * Kobling mellem kørende sælgere i Allio og «Sælger»-elementerne i Podios Møder-app
 * (Victor, Ernesto, Emil …). Standard: automatisk på fornavn; kan overskrives pr. bruger
 * (User.podioSellerItemId) på Administration → Booking.
 */
import { prisma } from "@/lib/prisma";
import {
  findReferenceableItems,
  isPodioAppConfigured,
  type PodioReferenceableItem,
} from "@/lib/podio/client";

/** Feltets label i Møder-appen. */
export const PODIO_SELLER_FIELD = "Sælger";

const OPTIONS_TTL_MS = 10 * 60 * 1000;
let optionsCache: { items: PodioReferenceableItem[]; expiresAt: number } | null = null;

/** Podio «Sælger»-elementer (cache 10 min). Tom liste hvis Podio ikke er sat op. */
export async function listPodioSellerOptions(opts: { fresh?: boolean } = {}): Promise<PodioReferenceableItem[]> {
  if (!isPodioAppConfigured("moeder")) return [];
  if (!opts.fresh && optionsCache && optionsCache.expiresAt > Date.now()) return optionsCache.items;
  const items = await findReferenceableItems("moeder", PODIO_SELLER_FIELD, "", 50);
  optionsCache = { items, expiresAt: Date.now() + OPTIONS_TTL_MS };
  return items;
}

function firstWord(s: string): string {
  return s.trim().toLowerCase().split(/\s+/u)[0] ?? "";
}

/** Find Podio-elementet for et navn: hele navnet først, ellers fornavn. */
export function matchPodioSellerByName(
  items: PodioReferenceableItem[],
  name: string,
): PodioReferenceableItem | null {
  const full = name.trim().toLowerCase();
  if (!full) return null;
  return (
    items.find((i) => i.title.toLowerCase() === full) ??
    items.find((i) => firstWord(i.title) === firstWord(full)) ??
    null
  );
}

/** Sælgerens Podio-element: manuelt valgt, ellers automatisk på navn (null = intet match). */
export async function resolvePodioSellerItemId(user: {
  name: string;
  podioSellerItemId: number | null;
}): Promise<number | null> {
  if (user.podioSellerItemId) return user.podioSellerItemId;
  const items = await listPodioSellerOptions();
  return matchPodioSellerByName(items, user.name)?.itemId ?? null;
}

/** Podio → Allio: hvilken kørende sælger svarer til et Podio «Sælger»-element? */
export async function findDrivingSellerByPodioItemId(itemId: number): Promise<string | null> {
  const sellers = await prisma.user.findMany({
    where: { isDrivingSeller: true },
    select: { id: true, name: true, podioSellerItemId: true },
  });
  const explicit = sellers.find((s) => s.podioSellerItemId === itemId);
  if (explicit) return explicit.id;
  const items = await listPodioSellerOptions();
  const title = items.find((i) => i.itemId === itemId)?.title;
  if (!title) return null;
  const byName = sellers.find(
    (s) => !s.podioSellerItemId && matchPodioSellerByName([{ itemId, title }], s.name),
  );
  return byName?.id ?? null;
}
