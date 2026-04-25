import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

type Params = { params: Promise<{ id: string }> };

/**
 * Log VOIP fejl/afvisning så de vises under Aktivitet (CALL_ATTEMPT + dansk sammenfatning).
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id: leadId } = await params;
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const userMessage = typeof body?.userMessage === "string" ? body.userMessage.trim() : "";
  const technical = typeof body?.technical === "string" ? body.technical.trim() : "";

  if (!userMessage) {
    return NextResponse.json({ error: "userMessage er påkrævet" }, { status: 400 });
  }

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        status: true,
        bookedByUserId: true,
        callbackReservedByUserId: true,
      },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead findes ikke" }, { status: 404 });
    }
    if (!canAccessCallbackLead(session.user.role, userId, lead)) {
      return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
    }
    if (!canAccessBookedMeetingNotes(session.user.role, userId, lead)) {
      return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
    }

    const summary =
      technical.length > 0
        ? `VoIP fejlede: ${userMessage} — ${technical.slice(0, 400)}${technical.length > 400 ? "…" : ""}`
        : `VoIP fejlede: ${userMessage}`;

    await prisma.leadActivityEvent.create({
      data: {
        leadId,
        userId,
        kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
        summary: summary.slice(0, 2000),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Kunne ikke logge opkald.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
