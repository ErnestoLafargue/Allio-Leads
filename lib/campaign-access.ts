import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCampaignDialMode } from "@/lib/dial-mode";

export type SessionUserLike = {
  id?: string | null;
  role?: string | null;
};

/** Dial-modes der indgår i «Ring alle tildelte» (Power Dialer udeladt). */
export const DIAL_POOL_MODES = ["CLICK_TO_CALL", "PREDICTIVE"] as const;

export function isDialPoolMode(raw: string | null | undefined): boolean {
  const mode = normalizeCampaignDialMode(raw);
  return mode === "CLICK_TO_CALL" || mode === "PREDICTIVE";
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

/**
 * Prisma `where` for Campaign-lister.
 * ADMIN: alle. SELLER: kun kampagner med CampaignAssignment for brugeren.
 */
export function campaignWhereForUser(
  user: SessionUserLike | null | undefined,
): Prisma.CampaignWhereInput {
  if (!user?.id) {
    return { id: { in: [] } };
  }
  if (isAdminRole(user.role)) {
    return {};
  }
  return {
    assignments: { some: { userId: user.id } },
  };
}

/** True hvis admin eller brugeren har assignment på kampagnen. */
export async function userCanAccessCampaign(
  user: SessionUserLike | null | undefined,
  campaignId: string,
): Promise<boolean> {
  if (!user?.id || !campaignId) return false;
  if (isAdminRole(user.role)) return true;
  const row = await prisma.campaignAssignment.findUnique({
    where: {
      userId_campaignId: { userId: user.id, campaignId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Intersection af userIds der er tildelt *alle* angivne kampagner.
 * Tom campaignIds → tom liste.
 */
export async function intersectionAssignedUserIds(campaignIds: string[]): Promise<string[]> {
  const ids = [...new Set(campaignIds.map((c) => c.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const rows = await prisma.campaignAssignment.findMany({
    where: { campaignId: { in: ids } },
    select: { userId: true, campaignId: true },
  });
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    let set = byUser.get(r.userId);
    if (!set) {
      set = new Set();
      byUser.set(r.userId, set);
    }
    set.add(r.campaignId);
  }
  const out: string[] = [];
  for (const [userId, set] of byUser) {
    if (set.size === ids.length) out.push(userId);
  }
  return out;
}

export async function campaignIdsAssignedToUser(userId: string): Promise<string[]> {
  const rows = await prisma.campaignAssignment.findMany({
    where: { userId },
    select: { campaignId: true },
  });
  return rows.map((r) => r.campaignId);
}

/**
 * Kampagner til «Ring alle tildelte»: altid fra CampaignAssignment (ingen admin-bypass),
 * kun CLICK_TO_CALL / PREDICTIVE. Stabil sortering: createdAt asc, id asc.
 */
export async function dialPoolCampaignIdsForUser(userId: string): Promise<string[]> {
  if (!userId.trim()) return [];
  const rows = await prisma.campaignAssignment.findMany({
    where: { userId },
    select: {
      campaign: {
        select: { id: true, dialMode: true, createdAt: true },
      },
    },
  });
  const eligible = rows
    .map((r) => r.campaign)
    .filter((c) => isDialPoolMode(c.dialMode))
    .sort((a, b) => {
      const ta = a.createdAt.getTime();
      const tb = b.createdAt.getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  return eligible.map((c) => c.id);
}

/** Ren helper til unit test / round-robin uden DB. */
export function orderDialPoolRoundRobin(
  campaignIds: string[],
  afterCampaignId: string | null | undefined,
): string[] {
  const ids = [...campaignIds];
  if (ids.length === 0) return [];
  const after = typeof afterCampaignId === "string" ? afterCampaignId.trim() : "";
  if (!after) return ids;
  const idx = ids.indexOf(after);
  if (idx < 0) return ids;
  return [...ids.slice(idx + 1), ...ids.slice(0, idx + 1)];
}
