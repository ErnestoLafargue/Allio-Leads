import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_LOCK_CLEAR, isLockActive } from "@/lib/lead-lock";
import { isCallbackTimeInCopenhagenBusinessWindow } from "@/lib/callback-datetime";

type Params = { params: Promise<{ id: string }> };

const leadInclude = {
  bookedByUser: { select: { id: true, name: true, username: true } as const },
  campaign: { select: { id: true, name: true, fieldConfig: true } as const },
  lockedByUser: { select: { id: true, name: true, username: true } as const },
  callbackReservedByUser: { select: { id: true, name: true, username: true } as const },
  callbackCreatedByUser: { select: { id: true, name: true, username: true } as const },
} as const;

/**
 * Planlæg genopkald: status CALLBACK_SCHEDULED, reservation til kalder, frigør kortvarigt lås.
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const scheduledRaw = body?.scheduledFor;
  if (typeof scheduledRaw !== "string") {
    return NextResponse.json({ error: "Angiv «scheduledFor» som ISO-dato og -tid." }, { status: 400 });
  }
  const scheduledFor = new Date(scheduledRaw.trim());
  if (Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json({ error: "Ugyldig dato." }, { status: 400 });
  }

  let assignedUserId = typeof body?.assignedUserId === "string" ? body.assignedUserId.trim() : userId;

  const assignee = await prisma.user.findUnique({ where: { id: assignedUserId }, select: { id: true } });
  if (!assignee) {
    return NextResponse.json({ error: "Ukendt bruger til tildeling." }, { status: 400 });
  }

  const now = new Date();
  const minFuture = new Date(now.getTime() - 60_000);
  if (scheduledFor.getTime() <= minFuture.getTime()) {
    return NextResponse.json(
      { error: "Vælg et tidspunkt i fremtiden (mindst ét minut fra nu)." },
      { status: 400 },
    );
  }
  if (!isCallbackTimeInCopenhagenBusinessWindow(scheduledFor)) {
    return NextResponse.json(
      { error: "Tilbagekald skal ligge mellem kl. 08:00 og 20:00 (København)." },
      { status: 400 },
    );
  }

  try {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

    if (lead.status === "CALLBACK_SCHEDULED") {
      return NextResponse.json(
        { error: "Dette lead har allerede et planlagt callback." },
        { status: 409 },
      );
    }

    if (lead.status !== "NEW") {
      return NextResponse.json(
        { error: "Callback kan kun planlægges fra et «Ny»-lead i kampagnekøen." },
        { status: 400 },
      );
    }

    const role = session.user.role;
    if (role !== "ADMIN") {
      if (!isLockActive(lead, now) || lead.lockedByUserId !== userId) {
        return NextResponse.json(
          {
            error:
              "Du skal have leadet aktivt i kampagne-arbejdet (låst til dig) for at planlægge callback.",
          },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        status: "CALLBACK_SCHEDULED",
        callbackScheduledFor: scheduledFor,
        callbackReservedByUserId: assignedUserId,
        callbackCreatedByUserId: userId,
        callbackStatus: "PENDING",
        callbackNote: "",
        ...LEAD_LOCK_CLEAR,
      },
      include: leadInclude,
    });

    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("callbackScheduledFor") ||
      msg.includes("callbackReservedByUserId") ||
      msg.includes("callbackStatus") ||
      msg.includes("callbackCreatedByUserId") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen mangler callback-kolonner. Kør «npx prisma migrate deploy» og genstart serveren."
          : "Kunne ikke planlægge callback.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}
