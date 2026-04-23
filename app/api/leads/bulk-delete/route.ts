import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(
      idsRaw
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean),
    ),
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: "Vælg mindst ét lead" }, { status: 400 });
  }

  const result = await prisma.lead.deleteMany({
    where: { id: { in: ids } },
  });
  return NextResponse.json({ deletedCount: result.count });
}
