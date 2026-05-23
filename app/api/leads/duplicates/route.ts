import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { buildDuplicateGroups } from "@/lib/lead-duplicates";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const rows = await prisma.lead.findMany({
      select: {
        id: true,
        companyName: true,
        customFields: true,
        cvr: true,
        phone: true,
        status: true,
        importedAt: true,
        lastOutcomeAt: true,
        callbackReservedByUserId: true,
        campaign: { select: { id: true, name: true } },
      },
      orderBy: [{ importedAt: "desc" }],
    });

    const filtered =
      session!.user.role === "ADMIN"
        ? rows
        : rows.filter(
            (l) =>
              l.status !== "CALLBACK_SCHEDULED" ||
              l.callbackReservedByUserId === session!.user.id,
          );

    const result = buildDuplicateGroups(
      filtered.map((l) => ({
        id: l.id,
        companyName: l.companyName,
        customFields: l.customFields,
        cvr: l.cvr,
        phone: l.phone,
        status: l.status,
        importedAt: l.importedAt,
        lastOutcomeAt: l.lastOutcomeAt,
        campaign: l.campaign,
      })),
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Kunne ikke finde dubletter.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
