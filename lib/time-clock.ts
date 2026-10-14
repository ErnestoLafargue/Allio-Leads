import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";

const TZ = "Europe/Copenhagen";

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const TIME_CLOCK_CHANGED_EVENT = "allio:time-clock";

export type TimeClockAction = "in" | "out";

export type TimeClockEntryDto = {
  id: string;
  punchedInAt: string;
  punchedOutAt: string | null;
  dayKey: string;
  seconds: number;
  open: boolean;
};

export type TimeClockUserRow = {
  userId: string;
  name: string;
  username: string;
  role: string;
  clockedIn: boolean;
  totalSeconds: number;
  entries: TimeClockEntryDto[];
};

export type TimeClockStatus = {
  clockedIn: boolean;
  openEntry: TimeClockEntryDto | null;
  todayKey: string;
  todaySeconds: number;
  todayEntries: TimeClockEntryDto[];
};

export type TimeClockOverview = {
  dayKey: string;
  todayKey: string;
  dayLabel: string;
  isAdmin: boolean;
  clockedInCount: number;
  rows: TimeClockUserRow[];
};

export type TimeClockErrorCode =
  | "already_in"
  | "not_in"
  | "invalid_times"
  | "overlap"
  | "already_open"
  | "not_found";

export class TimeClockError extends Error {
  constructor(
    message: string,
    readonly code: TimeClockErrorCode,
  ) {
    super(message);
    this.name = "TimeClockError";
  }
}

export type TimeClockEntryLike = {
  id: string;
  userId: string;
  punchedInAt: Date;
  punchedOutAt: Date | null;
  dayKey: string;
};

export type TimeClockUserLike = {
  id: string;
  name: string;
  username: string;
  role: string;
};

export function isValidDayKey(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && DAY_KEY_RE.test(raw);
}

const DATETIME_LOCAL_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;
const FUTURE_SKEW_MS = 2 * 60 * 1000;

/** `datetime-local` værdi (YYYY-MM-DDTHH:mm) i Europe/Copenhagen. */
export function formatCopenhagenDateTimeLocal(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const hourRaw = get("hour");
  const hour = hourRaw === "24" ? "00" : hourRaw;
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Fortolker `datetime-local` som vægur i Europe/Copenhagen. */
export function parseCopenhagenDateTimeLocal(raw: string): Date | null {
  const m = DATETIME_LOCAL_RE.exec(raw.trim());
  if (!m) return null;
  const dayKey = m[1]!;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (!isValidDayKey(dayKey) || hour > 23 || minute > 59) return null;
  try {
    const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
    return new Date(start.getTime() + hour * 3_600_000 + minute * 60_000);
  } catch {
    return null;
  }
}

export function punchIntervalsOverlap(
  a: { punchedInAt: Date; punchedOutAt: Date | null },
  b: { punchedInAt: Date; punchedOutAt: Date | null },
  now: Date,
): boolean {
  if (a.punchedOutAt == null && b.punchedOutAt == null) return true;
  const aEnd = a.punchedOutAt ?? now;
  const bEnd = b.punchedOutAt ?? now;
  return a.punchedInAt.getTime() < bEnd.getTime() && b.punchedInAt.getTime() < aEnd.getTime();
}

export function validateAdminPunchTimes(args: {
  punchedInAt: Date;
  punchedOutAt: Date | null;
  now: Date;
  others: Array<{ punchedInAt: Date; punchedOutAt: Date | null }>;
}): { ok: true } | { ok: false; message: string; code: TimeClockErrorCode } {
  const { punchedInAt, punchedOutAt, now, others } = args;
  if (!Number.isFinite(punchedInAt.getTime())) {
    return { ok: false, code: "invalid_times", message: "Ugyldigt ind-tidspunkt." };
  }
  if (punchedOutAt && !Number.isFinite(punchedOutAt.getTime())) {
    return { ok: false, code: "invalid_times", message: "Ugyldigt ud-tidspunkt." };
  }
  if (punchedInAt.getTime() > now.getTime() + FUTURE_SKEW_MS) {
    return { ok: false, code: "invalid_times", message: "Ind-tidspunktet kan ikke ligge i fremtiden." };
  }
  if (punchedOutAt && punchedOutAt.getTime() > now.getTime() + FUTURE_SKEW_MS) {
    return { ok: false, code: "invalid_times", message: "Ud-tidspunktet kan ikke ligge i fremtiden." };
  }
  if (punchedOutAt && punchedOutAt.getTime() <= punchedInAt.getTime()) {
    return { ok: false, code: "invalid_times", message: "Ud skal være efter ind." };
  }
  if (punchedOutAt == null && others.some((e) => e.punchedOutAt == null)) {
    return {
      ok: false,
      code: "already_open",
      message: "Personen er allerede stemplet ind. Ret den åbne tid i stedet.",
    };
  }
  for (const other of others) {
    if (punchIntervalsOverlap({ punchedInAt, punchedOutAt }, other, now)) {
      return {
        ok: false,
        code: "overlap",
        message: "Tiden overlapper en anden stempling for samme person.",
      };
    }
  }
  return { ok: true };
}

export function clockedSeconds(
  punchedInAt: Date,
  punchedOutAt: Date | null,
  now: Date,
): number {
  const end = punchedOutAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - punchedInAt.getTime()) / 1000));
}

export function formatClockedDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s <= 0) return "—";
  if (s < 60) return `${s} s`;
  const totalMinutes = Math.floor(s / 60);
  if (totalMinutes < 60) return `${totalMinutes} m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} t ${m.toString().padStart(2, "0")} m`;
}

/** Løbende ur som i Planday: 02:14:33 */
export function formatClockedLive(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export function formatClockTime(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Klokkeslæt, plus dato når stemplingen ligger på en anden kalenderdag end visningen. */
export function formatClockStamp(at: Date | string, viewDayKey: string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const time = formatClockTime(d);
  if (copenhagenDayKey(d) === viewDayKey) return time;
  const date = new Intl.DateTimeFormat("da-DK", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  }).format(d);
  return `${date} ${time}`;
}

export function formatDayLabel(dayKey: string): string {
  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
}

export function shiftDayKey(dayKey: string, diffDays: number): string {
  const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return dayKey;
  const dt = new Date(Date.UTC(y, m - 1, d + diffDays, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function serializeEntry(entry: TimeClockEntryLike, now: Date): TimeClockEntryDto {
  const open = entry.punchedOutAt == null;
  return {
    id: entry.id,
    punchedInAt: entry.punchedInAt.toISOString(),
    punchedOutAt: entry.punchedOutAt?.toISOString() ?? null,
    dayKey: entry.dayKey,
    seconds: clockedSeconds(entry.punchedInAt, entry.punchedOutAt, now),
    open,
  };
}

export function sumClockedSeconds(entries: TimeClockEntryLike[], now: Date): number {
  return entries.reduce(
    (acc, e) => acc + clockedSeconds(e.punchedInAt, e.punchedOutAt, now),
    0,
  );
}

export function buildOverviewRows(args: {
  users: TimeClockUserLike[];
  dayEntries: TimeClockEntryLike[];
  openEntries: TimeClockEntryLike[];
  now: Date;
  includeOpenFromOtherDays: boolean;
}): TimeClockUserRow[] {
  const entriesByUser = new Map<string, TimeClockEntryLike[]>();
  const add = (entry: TimeClockEntryLike) => {
    const list = entriesByUser.get(entry.userId);
    if (list) {
      if (!list.some((x) => x.id === entry.id)) list.push(entry);
    } else {
      entriesByUser.set(entry.userId, [entry]);
    }
  };

  for (const e of args.dayEntries) add(e);
  if (args.includeOpenFromOtherDays) {
    for (const e of args.openEntries) add(e);
  }

  const openIds = new Set(args.openEntries.map((e) => e.userId));

  const rows: TimeClockUserRow[] = args.users.map((u) => {
    const entries = (entriesByUser.get(u.id) ?? []).slice().sort((a, b) => {
      return a.punchedInAt.getTime() - b.punchedInAt.getTime();
    });
    return {
      userId: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      clockedIn: openIds.has(u.id),
      totalSeconds: sumClockedSeconds(entries, args.now),
      entries: entries.map((e) => serializeEntry(e, args.now)),
    };
  });

  rows.sort(compareOverviewRows);
  return rows;
}

/** 0 = stemplet ind nu, 1 = har tider (ude), 2 = ingen. */
export function overviewRowSortRank(row: { entries: { open?: boolean }[] }): number {
  if (row.entries.some((e) => e.open)) return 0;
  if (row.entries.length > 0) return 1;
  return 2;
}

export function compareOverviewRows(
  a: Pick<TimeClockUserRow, "name" | "entries">,
  b: Pick<TimeClockUserRow, "name" | "entries">,
): number {
  const rank = overviewRowSortRank(a) - overviewRowSortRank(b);
  if (rank !== 0) return rank;
  return a.name.localeCompare(b.name, "da");
}

export function liveOpenSeconds(openEntry: TimeClockEntryDto | null | undefined, nowMs: number): number {
  if (!openEntry) return 0;
  const start = new Date(openEntry.punchedInAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((nowMs - start) / 1000));
}

export function liveTodaySeconds(
  status: Pick<TimeClockStatus, "todaySeconds" | "openEntry">,
  nowMs: number,
): number {
  if (!status.openEntry) return status.todaySeconds;
  return Math.max(0, status.todaySeconds - status.openEntry.seconds + liveOpenSeconds(status.openEntry, nowMs));
}

export function withLiveOverviewSeconds(
  overview: TimeClockOverview,
  nowMs: number,
): TimeClockOverview {
  const rows = overview.rows.map((row) => {
    const entries = row.entries.map((e) =>
      e.open ? { ...e, seconds: liveOpenSeconds(e, nowMs) } : e,
    );
    return {
      ...row,
      entries,
      totalSeconds: entries.reduce((acc, e) => acc + e.seconds, 0),
    };
  });
  return { ...overview, rows };
}

export function notifyTimeClockChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TIME_CLOCK_CHANGED_EVENT));
}
