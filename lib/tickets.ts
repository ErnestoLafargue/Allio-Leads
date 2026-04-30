import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";
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
  isShared: boolean;
  /** YYYY-MM-DD eller null. Klienten skal aldrig se en tidsstempel. */
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  snoozedUntil: string | null;
  hiddenFromDailyUntil: string | null;
  assignedUser: { id: string; name: string; username: string };
  createdBy: { id: string; name: string; username: string };
};

type RawTicket = {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  isShared: boolean;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  snoozedUntil: Date | null;
  hiddenFromDailyUntil: Date | null;
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
    isShared: Boolean(t.isShared),
    deadline: t.deadline ? dayKeyFromDate(t.deadline) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    snoozedUntil: t.snoozedUntil ? t.snoozedUntil.toISOString() : null,
    hiddenFromDailyUntil: t.hiddenFromDailyUntil ? t.hiddenFromDailyUntil.toISOString() : null,
    assignedUser: t.assignedUser,
    createdBy: t.createdBy,
  };
}

/**
 * Returnér midnat i Europe/Copenhagen for "i morgen" (relativt til serverens nu).
 * Bruges til at auto-skjule tickets fra dagskalenderen når status sættes til
 * "in_progress" eller "waiting" eller når man udskyder.
 */
function tomorrowCopenhagenStart(): Date {
  const today = copenhagenDayKey();
  const [y, m, d] = today.split("-").map(Number);
  const nextDayKey = (() => {
    const utc = Date.UTC(y, m - 1, d) + 86_400_000;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(utc));
  })();
  return copenhagenDayBoundsUtcFromDayKey(nextDayKey).start;
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
  const andClauses: Record<string, unknown>[] = [];

  if (filters.scope === "mine") {
    andClauses.push({
      OR: [{ assignedUserId: viewerId }, { createdByUserId: viewerId }, { isShared: true }],
    });
  }
  if (filters.status && isTicketStatus(filters.status)) {
    where.status = filters.status;
  }
  if (filters.priority && isTicketPriority(filters.priority)) {
    where.priority = filters.priority;
  }
  if (filters.assigneeId) {
    andClauses.push({ OR: [{ assignedUserId: filters.assigneeId }, { isShared: true }] });
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
  if (andClauses.length) {
    where.AND = andClauses;
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
  assignedUserId?: string;
  isShared?: boolean;
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
  const isShared = Boolean(input.isShared);
  const normalizedAssignedUserId = input.assignedUserId?.trim() || viewerId;
  if (!normalizedAssignedUserId) {
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
      isShared,
      deadline,
      assignedUserId: normalizedAssignedUserId,
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
  snoozedUntilDayKey: string | null;
  /** "tomorrow" = sæt til midnat i morgen (Europe/Copenhagen). null = ryd. */
  hiddenFromDailyUntil: "tomorrow" | null | undefined;
  assignedUserId: string;
  isShared: boolean;
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
  if (input.isShared !== undefined) {
    data.isShared = Boolean(input.isShared);
  }
  if (input.deadlineDayKey !== undefined) {
    data.deadline = parseDeadlineDayKey(input.deadlineDayKey);
  }
  if (input.snoozedUntilDayKey !== undefined) {
    data.snoozedUntil = parseSnoozedUntilDayKey(input.snoozedUntilDayKey);
  }
  if (input.status !== undefined) {
    if (!isTicketStatus(input.status)) {
      throw new ValidationError(`Ugyldig status. Forventede én af: ${TICKET_STATUSES.join(", ")}.`);
    }
    data.status = input.status;
    data.completedAt = input.status === "done" ? new Date() : null;
    // Auto-skjul ticket fra dagskalenderen når status går til "i gang" eller "afventer".
    // "open" eller "done" rydder skjul-feltet, så ticketen kan være aktiv igen.
    if (input.status === "in_progress" || input.status === "waiting") {
      data.hiddenFromDailyUntil = tomorrowCopenhagenStart();
    } else if (input.status === "open" || input.status === "done") {
      data.hiddenFromDailyUntil = null;
    }
  }
  // Eksplicit override af hiddenFromDailyUntil (har forrang over status-auto)
  if (input.hiddenFromDailyUntil !== undefined) {
    data.hiddenFromDailyUntil =
      input.hiddenFromDailyUntil === "tomorrow" ? tomorrowCopenhagenStart() : null;
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

function parseSnoozedUntilDayKey(raw: string | null): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!isDayKey(raw)) {
    throw new ValidationError("Snooze-dato skal være på formen YYYY-MM-DD.");
  }
  const { start } = copenhagenDayBoundsUtcFromDayKey(raw);
  return start;
}

export type DailyQueueItem = TicketDto & {
  queueReason: "overdue" | "important" | "deadline_window" | "fallback";
};

type QueuePriority = "haster" | "snarest_muligt" | "normal" | "naar_tiden_passer";
const PRIORITY_RANK: Record<QueuePriority, number> = {
  haster: 0,
  snarest_muligt: 1,
  normal: 2,
  naar_tiden_passer: 3,
};

function dateFromDayKeyUtc(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function compareQueueOrder(a: TicketDto, b: TicketDto): number {
  const aOver = a.deadline ? a.deadline < copenhagenDayKey() : false;
  const bOver = b.deadline ? b.deadline < copenhagenDayKey() : false;
  if (aOver !== bOver) return aOver ? -1 : 1;

  const ap = PRIORITY_RANK[a.priority as QueuePriority] ?? 99;
  const bp = PRIORITY_RANK[b.priority as QueuePriority] ?? 99;
  if (ap !== bp) return ap - bp;

  if (a.deadline && b.deadline && a.deadline !== b.deadline) {
    return a.deadline < b.deadline ? -1 : 1;
  }
  if (a.deadline && !b.deadline) return -1;
  if (!a.deadline && b.deadline) return 1;
  return a.createdAt < b.createdAt ? -1 : 1;
}

/**
 * Dagskalender-kø: hvilke tickets bør brugeren arbejde på den valgte dag.
 */
export async function getDailyTicketQueue(
  userId: string,
  selectedDate: string,
): Promise<DailyQueueItem[]> {
  if (!isDayKey(selectedDate)) {
    throw new ValidationError("selectedDate skal være YYYY-MM-DD.");
  }
  const selectedStart = dateFromDayKeyUtc(selectedDate);
  const plus30 = new Date(selectedStart.getTime() + 30 * 24 * 3_600_000);
  const plus14 = new Date(selectedStart.getTime() + 14 * 24 * 3_600_000);

  const rows = await prisma.ticket.findMany({
    where: {
      OR: [{ assignedUserId: userId }, { isShared: true }],
      status: { not: "done" },
      AND: [
        { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: selectedStart } }] },
        {
          OR: [
            { hiddenFromDailyUntil: null },
            { hiddenFromDailyUntil: { lte: selectedStart } },
          ],
        },
      ],
    },
    include: TICKET_INCLUDE,
  });
  const tickets = rows.map(serialize);

  const overdue: DailyQueueItem[] = [];
  const important: DailyQueueItem[] = [];
  const normalWindow: DailyQueueItem[] = [];
  const normalUrgent: DailyQueueItem[] = [];
  const noDeadline: DailyQueueItem[] = [];

  for (const t of tickets) {
    const pri = t.priority as QueuePriority;
    const deadline = t.deadline ? dateFromDayKeyUtc(t.deadline) : null;
    const isOverdue = deadline ? deadline < selectedStart : false;
    if (isOverdue) {
      overdue.push({ ...t, queueReason: "overdue" });
      continue;
    }
    if (pri === "haster" || pri === "snarest_muligt") {
      important.push({ ...t, queueReason: "important" });
      continue;
    }
    if (deadline && deadline <= plus30) {
      if (deadline <= plus14) normalUrgent.push({ ...t, queueReason: "deadline_window" });
      else normalWindow.push({ ...t, queueReason: "deadline_window" });
      continue;
    }
    if (!deadline) {
      noDeadline.push({ ...t, queueReason: "fallback" });
    }
  }

  important.sort(compareQueueOrder);
  overdue.sort(compareQueueOrder);
  normalUrgent.sort(compareQueueOrder);
  normalWindow.sort(compareQueueOrder);
  noDeadline.sort(compareQueueOrder);

  const core = [...overdue, ...important];
  const importantCount = core.filter(
    (t) => t.priority === "haster" || t.priority === "snarest_muligt",
  ).length;

  let extras: DailyQueueItem[] = [...normalUrgent];
  if (importantCount < 5) {
    const remainingSlots = Math.max(0, 5 - importantCount - normalUrgent.length);
    extras = [...extras, ...normalWindow.slice(0, remainingSlots)];
    const remainingAfterNormal = Math.max(0, remainingSlots - normalWindow.length);
    extras = [...extras, ...noDeadline.slice(0, remainingAfterNormal)];
  }

  return [...core, ...extras].sort(compareQueueOrder);
}
