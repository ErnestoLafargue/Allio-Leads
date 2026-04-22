import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

type Params = { params: Promise<{ id: string }> };

/** Undgå støj ved gentagne refresh: én «åbnet»-linje pr. bruger pr. lead i dette vindue. */
const DETAIL_OPEN_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Kald fra leaddetalje når siden er loaded — logger at brugeren har åbnet leadet
 * (uanset om det er fra Leads, Historik, Møder eller kampagne-link).
 */
export async function POST(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;
  const userId = session.user.id;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        bookedByUserId: true,
        callbackReservedByUserId: true,
      },
    });
    if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

    if (!canAccessCallbackLead(session.user.role, userId, lead)) {
      return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
    }
    if (!canAccessBookedMeetingNotes(session.user.role, userId, lead)) {
      return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
    }

    const recent = await prisma.leadActivityEvent.findFirst({
      where: {
        leadId: id,
        userId,
        kind: LEAD_ACTIVITY_KIND.LEAD_DETAIL_OPEN,
        createdAt: { gte: new Date(Date.now() - DETAIL_OPEN_COOLDOWN_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    const actor = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const label = actor?.name?.trim() || "Bruger";
    await prisma.leadActivityEvent.create({
      data: {
        leadId: id,
        userId,
        kind: LEAD_ACTIVITY_KIND.LEAD_DETAIL_OPEN,
        summary: `${label} åbnede leadet`,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Kunne ikke registrere visning.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
