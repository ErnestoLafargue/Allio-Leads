import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { copenhagenDayBoundsUtc, copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const searchParams = new URL(req.url).searchParams;
  const requestedDayKey = searchParams.get("dayKey")?.trim() ?? "";
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDayKey) ? requestedDayKey : copenhagenDayKey();

  let start: Date;
  let end: Date;
  try {
    const bounds = requestedDayKey ? copenhagenDayBoundsUtcFromDayKey(dayKey) : copenhagenDayBoundsUtc();
    start = bounds.start;
    end = bounds.end;
  } catch {
    return NextResponse.json({ error: "Ugyldig dato." }, { status: 400 });
  }

  const requestedUserId = searchParams.get("userId")?.trim() ?? "";
  let historyUserId = session.user.id;
  if (requestedUserId) {
    if (session.user.role !== "ADMIN") {
      if (requestedUserId !== session.user.id) {
        return NextResponse.json({ error: "Kun administrator kan se andres historik." }, { status: 403 });
      }
    } else {
      const userExists = await prisma.user.findUnique({
        where: { id: requestedUserId },
        select: { id: true },
      });
      if (!userExists) {
        return NextResponse.json({ error: "Bruger findes ikke." }, { status: 400 });
      }
      historyUserId = requestedUserId;
    }
  }

  const rows = await prisma.leadVisitHistory.findMany({
    where: {
      userId: historyUserId,
      visitedAt: { gte: start, lt: end },
    },
    orderBy: { visitedAt: "desc" },
    select: {
      id: true,
      leadId: true,
      campaignId: true,
      companyName: true,
      statusAtVisit: true,
      dayKey: true,
      visitedAt: true,
      campaign: { select: { id: true, name: true } },
      lead: { select: { id: true, companyName: true, status: true } },
    },
  });

  return NextResponse.json({
    dayKey,
    todayKey: copenhagenDayKey(),
    rows: rows.map((row) => ({
      id: row.id,
      leadId: row.leadId,
      campaignId: row.campaignId,
      campaignName: row.campaign?.name ?? null,
      companyName: row.companyName || row.lead?.companyName || "—",
      statusAtVisit: row.statusAtVisit,
      currentStatus: row.lead?.status ?? null,
      visitedAt: row.visitedAt.toISOString(),
    })),
  });
}
