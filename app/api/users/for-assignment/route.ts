import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

/** Alle brugere til tilbagekald-tildeling (sælgere + admin). */
export async function GET() {
  const { response } = await requireSession();
  if (response) return response;

  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, username: true, role: true, phone: true },
  });

  return NextResponse.json(users);
}
