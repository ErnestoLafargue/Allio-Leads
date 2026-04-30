import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { isTicketPriority, type TicketPriority } from "@/lib/ticket-priority";
import { isTicketStatus, type TicketStatus } from "@/lib/ticket-status";
import {
  createTicket,
  listTickets,
  ValidationError,
  type TicketListFilters,
} from "@/lib/tickets";

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "mine" ? "mine" : "all";

  const rawStatus = searchParams.get("status")?.trim();
  const rawPriority = searchParams.get("priority")?.trim();
  const assigneeId = searchParams.get("assignee")?.trim() || undefined;
  const fromDayKey = searchParams.get("from")?.trim() || undefined;
  const toDayKey = searchParams.get("to")?.trim() || undefined;

  const filters: TicketListFilters = {
    scope,
    status: rawStatus && isTicketStatus(rawStatus) ? (rawStatus as TicketStatus) : undefined,
    priority:
      rawPriority && isTicketPriority(rawPriority) ? (rawPriority as TicketPriority) : undefined,
    assigneeId,
    fromDayKey,
    toDayKey,
  };

  const tickets = await listTickets(session!.user.id, filters);
  return NextResponse.json({ tickets });
}

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Ugyldigt JSON-body" }, { status: 400 });
  }

  try {
    const ticket = await createTicket(session!.user.id, {
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : "",
      priority: body.priority as TicketPriority,
      status: body.status as TicketStatus | undefined,
      deadlineDayKey:
        typeof body.deadline === "string"
          ? body.deadline
          : body.deadline === null
            ? null
            : undefined,
      assignedUserId: typeof body.assignedUserId === "string" ? body.assignedUserId : undefined,
      isShared: body.isShared === true,
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[/api/tickets POST] ", err);
    return NextResponse.json({ error: "Kunne ikke oprette ticket." }, { status: 500 });
  }
}
