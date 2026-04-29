import { prisma } from "@/lib/prisma";
import { dayKeyFromDate, endOfDayUtcFromDayKey, isDayKey } from "@/lib/ticket-deadline";
import {
  isTicketPriority,
  TICKET_PRIORITIES,
  type TicketPriority,
} from "@/lib/ticket-priority";
import { isTicketStatus, TICKET_STATUSES, type TicketStatus } from "@/lib/ticket-status";

const USER_SELECT = { id: true, name: true, username: true } as const;

const TICKET_INCLUDE = {
  assignedUser: { select: USER_SELECT },
  createdBy: { select: USER_SELECT },
} as const;

export type TicketDto = {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  /** YYYY-MM-DD eller null. Klienten skal aldrig se en tidsstempel. */
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignedUser: { id: string; name: string; username: string };
  createdBy: { id: string; name: string; username: string };
};

type RawTicket = {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  assignedUser: { id: string; name: string; username: string };
  createdBy: { id: string; name: string; username: string };
};

function serialize(t: RawTicket): TicketDto {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    priority: (isTicketPriority(t.priority) ? t.priority : "normal") as TicketPriority,
    status: (isTicketStatus(t.status) ? t.status : "open") as TicketStatus,
    deadline: t.deadline ? dayKeyFromDate(t.deadline) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    assignedUser: t.assignedUser,
    createdBy: t.createdBy,
  };
}

export type TicketListFilters = {
  /** "mine" begrænser til viewer som assigned eller creator. */
  scope?: "mine" | "all";
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  /** YYYY-MM-DD inkluderet (deadline >= startOfDay). */
  fromDayKey?: string;
  /** YYYY-MM-DD inkluderet (deadline <= endOfDay). */
  toDayKey?: string;
};

export async function listTickets(
  viewerId: string,
  filters: TicketListFilters = {},
): Promise<TicketDto[]> {
  const where: Record<string, unknown> = {};

  if (filters.scope === "mine") {
    where.OR = [{ assignedUserId: viewerId }, { createdByUserId: viewerId }];
  }
  if (filters.status && isTicketStatus(filters.status)) {
    where.status = filters.status;
  }
  if (filters.priority && isTicketPriority(filters.priority)) {
    where.priority = filters.priority;
  }
  if (filters.assigneeId) {
    where.assignedUserId = filters.assigneeId;
  }

  if (filters.fromDayKey || filters.toDayKey) {
    const range: { gte?: Date; lte?: Date } = {};
    if (filters.fromDayKey && isDayKey(filters.fromDayKey)) {
      // start-of-day = endOfDay − 23:59:59.999 ≈ endOfDay − ~24t. Bruger endOfDay for fra-grænsen,
      // men subtraherer 23:59:59.999 for at få midnat.
      const end = endOfDayUtcFromDayKey(filters.fromDayKey);
      range.gte = new Date(end.getTime() - (24 * 3_600_000 - 1));
    }
    if (filters.toDayKey && isDayKey(filters.toDayKey)) {
      range.lte = endOfDayUtcFromDayKey(filters.toDayKey);
    }
    where.deadline = range;
  }

  const rows = await prisma.ticket.findMany({
    where,
    include: TICKET_INCLUDE,
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(serialize);
}

export async function getTicketById(id: string): Promise<TicketDto | null> {
  const row = await prisma.ticket.findUnique({ where: { id }, include: TICKET_INCLUDE });
  return row ? serialize(row) : null;
}

export type CreateTicketInput = {
  title: string;
  description?: string;
  priority: TicketPriority;
  status?: TicketStatus;
  deadlineDayKey?: string | null;
  assignedUserId: string;
};

export async function createTicket(
  viewerId: string,
  input: CreateTicketInput,
): Promise<TicketDto> {
  const title = input.title.trim();
  if (!title) {
    throw new ValidationError("Titel er påkrævet.");
  }
  if (!isTicketPriority(input.priority)) {
    throw new ValidationError(
      `Ugyldig prioritet. Forventede én af: ${TICKET_PRIORITIES.join(", ")}.`,
    );
  }
  const status = input.status ?? "open";
  if (!isTicketStatus(status)) {
    throw new ValidationError(`Ugyldig status. Forventede én af: ${TICKET_STATUSES.join(", ")}.`);
  }
  if (!input.assignedUserId?.trim()) {
    throw new ValidationError("Tildelt bruger er påkrævet.");
  }

  const deadline = parseDeadlineDayKey(input.deadlineDayKey ?? null);
  const completedAt = status === "done" ? new Date() : null;

  const row = await prisma.ticket.create({
    data: {
      title,
      description: input.description?.trim() ?? "",
      priority: input.priority,
      status,
      deadline,
      assignedUserId: input.assignedUserId,
      createdByUserId: viewerId,
      completedAt,
    },
    include: TICKET_INCLUDE,
  });
  return serialize(row);
}

export type UpdateTicketInput = Partial<{
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  deadlineDayKey: string | null;
  assignedUserId: string;
}>;

export async function updateTicket(id: string, input: UpdateTicketInput): Promise<TicketDto> {
  const data: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new ValidationError("Titel kan ikke være tom.");
    data.title = t;
  }
  if (input.description !== undefined) {
    data.description = input.description.trim();
  }
  if (input.priority !== undefined) {
    if (!isTicketPriority(input.priority)) {
      throw new ValidationError(
        `Ugyldig prioritet. Forventede én af: ${TICKET_PRIORITIES.join(", ")}.`,
      );
    }
    data.priority = input.priority;
  }
  if (input.assignedUserId !== undefined) {
    if (!input.assignedUserId.trim()) {
      throw new ValidationError("Tildelt bruger kan ikke være tom.");
    }
    data.assignedUserId = input.assignedUserId;
  }
  if (input.deadlineDayKey !== undefined) {
    data.deadline = parseDeadlineDayKey(input.deadlineDayKey);
  }
  if (input.status !== undefined) {
    if (!isTicketStatus(input.status)) {
      throw new ValidationError(`Ugyldig status. Forventede én af: ${TICKET_STATUSES.join(", ")}.`);
    }
    data.status = input.status;
    data.completedAt = input.status === "done" ? new Date() : null;
  }

  const row = await prisma.ticket.update({
    where: { id },
    data,
    include: TICKET_INCLUDE,
  });
  return serialize(row);
}

export async function deleteTicket(id: string): Promise<void> {
  await prisma.ticket.delete({ where: { id } });
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function parseDeadlineDayKey(raw: string | null): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!isDayKey(raw)) {
    throw new ValidationError("Deadline skal være på formen YYYY-MM-DD.");
  }
  return endOfDayUtcFromDayKey(raw);
}
