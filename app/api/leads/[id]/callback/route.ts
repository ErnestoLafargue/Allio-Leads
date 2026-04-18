import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_LOCK_CLEAR } from "@/lib/lead-lock";

type Params = { params: Promise<{ id: string }> };

const leadInclude = {
  bookedByUser: { select: { id: true, name: true, username: true } as const },
  campaign: { select: { id: true, name: true, fieldConfig: true } as const },
  lockedByUser: { select: { id: true, name: true, username: true } as const },
  callbackReservedByUser: { select: { id: true, name: true, username: true } as const },
} as const;

/**
 * Afslut eller annuller tilbagekald: lead tilbage til NEW, felter ryddes.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  if (action !== "complete" && action !== "cancel") {
    return NextResponse.json({ error: "Angiv action: «complete» eller «cancel»." }, { status: 400 });
  }

  try {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

    if (lead.status !== "CALLBACK_SCHEDULED" || lead.callbackStatus !== "PENDING") {
      return NextResponse.json({ error: "Lead har ikke et aktivt tilbagekald." }, { status: 400 });
    }

    if (session.user.role !== "ADMIN" && lead.callbackReservedByUserId !== userId) {
      return NextResponse.json({ error: "Kun den tildelte bruger eller admin kan lukke tilbagekaldet." }, { status: 403 });
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        status: "NEW",
        callbackScheduledFor: null,
        callbackReservedByUserId: null,
        callbackStatus: "PENDING",
        callbackNote: "",
        callbackCreatedByUserId: null,
        callbackSeenByAssigneeAt: null,
        ...LEAD_LOCK_CLEAR,
      },
      include: leadInclude,
    });

    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Kunne ikke opdatere tilbagekald.", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 },
    );
  }
}
