import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canManageBlockedTimeForUser } from "@/lib/blocked-time-auth";
import { listMeetingAssignableUsers } from "@/lib/meeting-assignee";

function parseIsoDate(raw: string | null, label: string): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  const { response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const from = parseIsoDate(searchParams.get("from"), "from");
  const to = parseIsoDate(searchParams.get("to"), "to");
  const userId = searchParams.get("userId")?.trim() || undefined;

  if (!from || !to) {
    return NextResponse.json({ error: "Angiv from og to som ISO-datoer." }, { status: 400 });
  }
  if (to <= from) {
    return NextResponse.json({ error: "to skal være efter from." }, { status: 400 });
  }

  try {
    const rows = await prisma.blockedTime.findMany({
      where: {
        startDateTime: { lt: to },
        endDateTime: { gt: from },
        ...(userId ? { userId } : {}),
      },
      orderBy: [{ startDateTime: "asc" }],
      include: {
        user: { select: { id: true, name: true, username: true } },
        createdBy: { select: { id: true, name: true, username: true } },
      },
    });
    return NextResponse.json({
      blockedTimes: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        title: r.title,
        startDateTime: r.startDateTime.toISOString(),
        endDateTime: r.endDateTime.toISOString(),
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        user: r.user,
        createdBy: r.createdBy,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke hente blokeringer", details: msg },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Ugyldigt JSON-body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const start = parseIsoDate(
    typeof body.startDateTime === "string" ? body.startDateTime : null,
    "start",
  );
  const end = parseIsoDate(
    typeof body.endDateTime === "string" ? body.endDateTime : null,
    "end",
  );

  if (!title) {
    return NextResponse.json({ error: "Angiv en titel/årsag." }, { status: 400 });
  }
  if (!targetUserId) {
    return NextResponse.json({ error: "Angiv bruger." }, { status: 400 });
  }
  if (!start || !end) {
    return NextResponse.json({ error: "Angiv gyldig start- og sluttid." }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "Sluttid skal være efter starttid." }, { status: 400 });
  }

  if (!canManageBlockedTimeForUser(session!, targetUserId)) {
    return NextResponse.json(
      { error: "Du kan kun blokere tid på din egen kalender." },
      { status: 403 },
    );
  }

  const assignees = await listMeetingAssignableUsers();
  if (!assignees.some((u) => u.id === targetUserId)) {
    return NextResponse.json({ error: "Ugyldig mødeansvarlig." }, { status: 400 });
  }

  try {
    const row = await prisma.blockedTime.create({
      data: {
        userId: targetUserId,
        title,
        startDateTime: start,
        endDateTime: end,
        createdByUserId: session!.user.id,
      },
      include: {
        user: { select: { id: true, name: true, username: true } },
        createdBy: { select: { id: true, name: true, username: true } },
      },
    });
    return NextResponse.json(
      {
        blockedTime: {
          id: row.id,
          userId: row.userId,
          title: row.title,
          startDateTime: row.startDateTime.toISOString(),
          endDateTime: row.endDateTime.toISOString(),
          createdByUserId: row.createdByUserId,
          user: row.user,
          createdBy: row.createdBy,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke oprette blokering", details: msg },
      { status: 500 },
    );
  }
}
