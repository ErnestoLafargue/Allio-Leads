import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Brugere hvis FlowZone kan ses. Indtil videre kun admins; senere også medarbejdere der får adgang. */
export const FLOWZONE_ROLES = ["ADMIN"];

/**
 * Den bruger hvis FlowZone der spørges efter (`?userId=`, ellers den indloggede).
 * Kun admins må kalde, og kun FlowZone for brugere med adgang kan vælges.
 */
export async function resolveFlowZoneUser(req: Request) {
  const { session, response } = await requireAdmin();
  if (response) return { userId: null, response };

  const requested = new URL(req.url).searchParams.get("userId");
  if (!requested || requested === session.user.id) return { userId: session.user.id, response: null };

  const target = await prisma.user.findUnique({ where: { id: requested }, select: { role: true } });
  if (!target || !FLOWZONE_ROLES.includes(target.role)) {
    return { userId: null, response: NextResponse.json({ error: "Ukendt bruger" }, { status: 404 }) };
  }
  return { userId: requested, response: null };
}
