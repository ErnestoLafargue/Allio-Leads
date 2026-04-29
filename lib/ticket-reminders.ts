import { prisma } from "@/lib/prisma";

const HOUR_MS = 3_600_000;

export type TicketReminderCandidate = {
  id: string;
  title: string;
  deadline: Date;
  priority: string;
  status: string;
  assignedUser: {
    id: string;
    name: string;
    username: string;
    phone: string | null;
  };
};

export type TicketReminderOptions = {
  /** Hvor mange timer ind i fremtiden vi skal kigge efter deadlines. Default 24t. */
  windowHours?: number;
  /** Hvis true (default) ekskluderes tickets uden assigneePhone — disse kan ikke modtage SMS. */
  requirePhone?: boolean;
};

/**
 * Returnerer aktive (ikke-færdige) tickets hvis deadline ligger inden for `windowHours`
 * frem fra `now` — strukturen er klar til at koble på en cron-route der sender SMS/mail.
 *
 * Bemærk: ingen afsendelseslogik er tilkoblet endnu. Når SMS/mail skal aktiveres oprettes
 * en `TicketReminderDispatch`-model (analogt til `MeetingReminderDispatch`) for at sikre
 * idempotens pr. ticket pr. dag.
 */
export async function getTicketsNeedingReminder(
  now: Date = new Date(),
  options: TicketReminderOptions = {},
): Promise<TicketReminderCandidate[]> {
  const windowHours = options.windowHours ?? 24;
  const requirePhone = options.requirePhone ?? true;
  const upperBound = new Date(now.getTime() + windowHours * HOUR_MS);

  const rows = await prisma.ticket.findMany({
    where: {
      status: { not: "done" },
      deadline: {
        gte: now,
        lte: upperBound,
      },
      ...(requirePhone
        ? { assignedUser: { phone: { not: null } } }
        : {}),
    },
    include: {
      assignedUser: {
        select: { id: true, name: true, username: true, phone: true },
      },
    },
    orderBy: { deadline: "asc" },
  });

  return rows
    .filter((row): row is typeof row & { deadline: Date } => row.deadline !== null)
    .map((row) => ({
      id: row.id,
      title: row.title,
      deadline: row.deadline,
      priority: row.priority,
      status: row.status,
      assignedUser: row.assignedUser,
    }));
}
