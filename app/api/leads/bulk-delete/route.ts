import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

export async function POST(req: Request) {
  const { response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Angiv mindst ét lead-id" }, { status: 400 });
  }
  const idList = ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (idList.length === 0) {
    return NextResponse.json({ error: "Ugyldige id'er" }, { status: 400 });
  }

  const result = await prisma.lead.deleteMany({
    where: { id: { in: idList } },
  });

  return NextResponse.json({ deleted: result.count });
}
