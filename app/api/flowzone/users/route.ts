import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { FLOWZONE_ROLES } from "@/lib/flowzone/flowzone-user";

/** GET /api/flowzone/users — brugere hvis FlowZone en admin kan skifte til. */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const users = await prisma.user.findMany({
    where: { role: { in: FLOWZONE_ROLES } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ users });
}
