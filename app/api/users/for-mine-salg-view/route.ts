import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

/** Brugerliste til admin «Vis Mine salg som bruger» (kun administrator). */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, username: true, role: true },
  });

  return NextResponse.json(users);
}
