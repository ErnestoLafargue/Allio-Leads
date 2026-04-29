import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/api-auth";
import { canDeleteTicket, canEditTicket } from "@/lib/ticket-access";
import {
  deleteTicket,
  getTicketById,
  updateTicket,
  ValidationError,
  type UpdateTicketInput,
} from "@/lib/tickets";
import type { TicketPriority } from "@/lib/ticket-priority";
import type { TicketStatus } from "@/lib/ticket-status";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { response } = await requireSession();
  if (response) return response;

  const { id } = await params;
  const ticket = await getTicketById(id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket ikke fundet." }, { status: 404 });
  }
  return NextResponse.json({ ticket });
}

export async function PATCH(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { id } = await params;
  const existing = await getTicketById(id);
  if (!existing) {
    return NextResponse.json({ error: "Ticket ikke fundet." }, { status: 404 });
  }

  const viewer = { id: session!.user.id, role: session!.user.role };
  if (
    !canEditTicket(viewer, {
      createdByUserId: existing.createdBy.id,
      assignedUserId: existing.assignedUser.id,
    })
  ) {
    return NextResponse.json(
      { error: "Du har ikke rettigheder til at redigere denne ticket." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Ugyldigt JSON-body" }, { status: 400 });
  }

  const input: UpdateTicketInput = {};
  if (typeof body.title === "string") input.title = body.title;
  if (typeof body.description === "string") input.description = body.description;
  if (typeof body.priority === "string") input.priority = body.priority as TicketPriority;
  if (typeof body.status === "string") input.status = body.status as TicketStatus;
  if (typeof body.assignedUserId === "string") input.assignedUserId = body.assignedUserId;
  if (body.deadline === null) input.deadlineDayKey = null;
  else if (typeof body.deadline === "string") input.deadlineDayKey = body.deadline;

  try {
    const ticket = await updateTicket(id, input);
    return NextResponse.json({ ticket });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Ticket ikke fundet." }, { status: 404 });
    }
    console.error("[/api/tickets/:id PATCH] ", err);
    return NextResponse.json({ error: "Kunne ikke opdatere ticket." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { id } = await params;
  const existing = await getTicketById(id);
  if (!existing) {
    return NextResponse.json({ error: "Ticket ikke fundet." }, { status: 404 });
  }

  const viewer = { id: session!.user.id, role: session!.user.role };
  if (
    !canDeleteTicket(viewer, {
      createdByUserId: existing.createdBy.id,
      assignedUserId: existing.assignedUser.id,
    })
  ) {
    return NextResponse.json(
      { error: "Kun opretter eller administrator kan slette." },
      { status: 403 },
    );
  }

  try {
    await deleteTicket(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Ticket ikke fundet." }, { status: 404 });
    }
    console.error("[/api/tickets/:id DELETE] ", err);
    return NextResponse.json({ error: "Kunne ikke slette ticket." }, { status: 500 });
  }
}
