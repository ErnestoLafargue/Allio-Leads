import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  TimeClockError,
  buildOverviewRows,
  formatDayLabel,
  serializeEntry,
  sumClockedSeconds,
  type TimeClockOverview,
  type TimeClockStatus,
} from "@/lib/time-clock";

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const entrySelect = {
  id: true,
  userId: true,
  punchedInAt: true,
  punchedOutAt: true,
  dayKey: true,
} as const;

export async function getTimeClockStatus(userId: string, now = new Date()): Promise<TimeClockStatus> {
  const todayKey = copenhagenDayKey(now);
  const [open, todayEntries] = await Promise.all([
    prisma.timeClockEntry.findFirst({
      where: { userId, punchedOutAt: null },
      select: entrySelect,
    }),
    prisma.timeClockEntry.findMany({
      where: { userId, dayKey: todayKey },
      orderBy: { punchedInAt: "asc" },
      select: entrySelect,
    }),
  ]);

  const entriesForToday = [...todayEntries];
  if (open && open.dayKey !== todayKey && !entriesForToday.some((e) => e.id === open.id)) {
    entriesForToday.push(open);
  }

  return {
    clockedIn: open != null,
    openEntry: open ? serializeEntry(open, now) : null,
    todayKey,
    todaySeconds: sumClockedSeconds(entriesForToday, now),
    todayEntries: entriesForToday.map((e) => serializeEntry(e, now)),
  };
}

export async function punchIn(userId: string, now = new Date()): Promise<TimeClockStatus> {
  try {
    await prisma.$transaction(async (tx) => {
      const open = await tx.timeClockEntry.findFirst({
        where: { userId, punchedOutAt: null },
        select: { id: true },
      });
      if (open) {
        throw new TimeClockError("Du er allerede stemplet ind.", "already_in");
      }
      await tx.timeClockEntry.create({
        data: {
          userId,
          punchedInAt: now,
          dayKey: copenhagenDayKey(now),
        },
      });
    });
  } catch (e) {
    if (e instanceof TimeClockError) throw e;
    if (isUniqueViolation(e)) {
      throw new TimeClockError("Du er allerede stemplet ind.", "already_in");
    }
    throw e;
  }
  return getTimeClockStatus(userId, now);
}

export async function punchOut(userId: string, now = new Date()): Promise<TimeClockStatus> {
  const updated = await prisma.timeClockEntry.updateMany({
    where: { userId, punchedOutAt: null },
    data: { punchedOutAt: now },
  });
  if (updated.count === 0) {
    throw new TimeClockError("Du er ikke stemplet ind.", "not_in");
  }
  return getTimeClockStatus(userId, now);
}

export async function getTimeClockOverview(args: {
  dayKey: string;
  viewer: { id: string; role: string };
  now?: Date;
}): Promise<TimeClockOverview> {
  const now = args.now ?? new Date();
  const todayKey = copenhagenDayKey(now);
  const isAdmin = args.viewer.role === "ADMIN";

  const users = isAdmin
    ? await prisma.user.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, username: true, role: true },
      })
    : await prisma.user.findMany({
        where: { id: args.viewer.id },
        select: { id: true, name: true, username: true, role: true },
      });

  const userIds = users.map((u) => u.id);
  const includeOpenFromOtherDays = args.dayKey === todayKey;

  const [dayEntries, openEntries] = await Promise.all([
    prisma.timeClockEntry.findMany({
      where: { userId: { in: userIds }, dayKey: args.dayKey },
      orderBy: { punchedInAt: "asc" },
      select: entrySelect,
    }),
    prisma.timeClockEntry.findMany({
      where: { userId: { in: userIds }, punchedOutAt: null },
      select: entrySelect,
    }),
  ]);

  const rows = buildOverviewRows({
    users,
    dayEntries,
    openEntries,
    now,
    includeOpenFromOtherDays,
  });

  return {
    dayKey: args.dayKey,
    todayKey,
    dayLabel: formatDayLabel(args.dayKey),
    isAdmin,
    clockedInCount: rows.filter((r) => r.clockedIn).length,
    rows,
  };
}
