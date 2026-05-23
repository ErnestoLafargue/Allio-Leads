import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canDeleteBlockedTime, canManageBlockedTimeForUser } from "@/lib/blocked-time-auth";
import { listMeetingAssignableUsers } from "@/lib/meeting-assignee";

type Params = { params: Promise<{ id: string }> };

function parseIsoDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function PATCH(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  const existing = await prisma.blockedTime.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Blokering ikke fundet." }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Ugyldigt JSON-body" }, { status: 400 });
  }

  const targetUserId =
    typeof body.userId === "string" ? body.userId.trim() : existing.userId;
  const title = typeof body.title === "string" ? body.title.trim() : existing.title;
  const start =
    body.startDateTime !== undefined
      ? parseIsoDate(body.startDateTime)
      : existing.startDateTime;
  const end =
    body.endDateTime !== undefined ? parseIsoDate(body.endDateTime) : existing.endDateTime;

  if (!title) {
    return NextResponse.json({ error: "Angiv en titel/årsag." }, { status: 400 });
  }
  if (!start || !end) {
    return NextResponse.json({ error: "Angiv gyldig start- og sluttid." }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "Sluttid skal være efter starttid." }, { status: 400 });
  }

  if (
    !canManageBlockedTimeForUser(session!, existing.userId) &&
    !canManageBlockedTimeForUser(session!, targetUserId)
  ) {
    return NextResponse.json({ error: "Ingen adgang til at redigere denne blokering." }, { status: 403 });
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
    const row = await prisma.blockedTime.update({
      where: { id },
      data: {
        userId: targetUserId,
        title,
        startDateTime: start,
        endDateTime: end,
      },
      include: {
        user: { select: { id: true, name: true, username: true } },
        createdBy: { select: { id: true, name: true, username: true } },
      },
    });
    return NextResponse.json({
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke opdatere blokering", details: msg },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  const existing = await prisma.blockedTime.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Blokering ikke fundet." }, { status: 404 });
  }

  if (!canDeleteBlockedTime(session!, existing)) {
    return NextResponse.json({ error: "Ingen adgang til at slette denne blokering." }, { status: 403 });
  }

  try {
    await prisma.blockedTime.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke slette blokering", details: msg },
      { status: 500 },
    );
  }
}
