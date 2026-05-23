import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";

export const MEETING_CALENDAR_HOUR_START = 9;
export const MEETING_CALENDAR_HOUR_END = 22;
export const MEETING_CALENDAR_HOURS =
  MEETING_CALENDAR_HOUR_END - MEETING_CALENDAR_HOUR_START + 1;
export const MEETING_CALENDAR_MINUTES =
  MEETING_CALENDAR_HOURS * 60;
export const MEETING_DEFAULT_DURATION_MIN = 45;
export const MEETING_CALENDAR_ROW_HEIGHT_PX = 56;
export const MEETING_CALENDAR_HEADER_HEIGHT_PX = 56;

const TZ = "Europe/Copenhagen";

export type CopenhagenDateTimeParts = {
  dayKey: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

export type MeetingCalendarPlacement = {
  topPct: number;
  heightPct: number;
  clamped: boolean;
  actualTimeLabel: string;
};

export type MeetingColumnLayout = {
  leftPct: number;
  widthPct: number;
  columnIndex: number;
  columnCount: number;
};

function parseDayKey(dayKey: string): { y: number; m: number; d: number } {
  const [ys, ms, ds] = dayKey.split("-");
  return { y: parseInt(ys, 10), m: parseInt(ms, 10), d: parseInt(ds, 10) };
}

function addDaysToDayKey(dayKey: string, delta: number): string {
  const { y, m, d } = parseDayKey(dayKey);
  const ms = Date.UTC(y, m - 1, d) + delta * 86_400_000;
  const dt = new Date(ms);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

export function copenhagenParts(iso: string | Date | null | undefined): CopenhagenDateTimeParts | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(d);

  const year = parseInt(fmt.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(fmt.find((p) => p.type === "month")!.value, 10);
  const day = parseInt(fmt.find((p) => p.type === "day")!.value, 10);
  let hour = parseInt(fmt.find((p) => p.type === "hour")!.value, 10);
  const minute = parseInt(fmt.find((p) => p.type === "minute")!.value, 10);
  if (hour === 24) hour = 0;

  const weekdayStr = fmt.find((p) => p.type === "weekday")!.value.toLowerCase();
  const weekdayMap: Record<string, number> = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 0,
  };
  const weekday = weekdayMap[weekdayStr.slice(0, 3)] ?? 0;
  const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { dayKey, year, month, day, hour, minute, weekday };
}

/** Mandag for ugen der indeholder `reference` (Copenhagen-dato). */
export function startOfWeekMondayDayKey(reference = new Date()): string {
  const parts = copenhagenParts(reference);
  if (!parts) return copenhagenDayKey(reference);
  const { dayKey, weekday } = parts;
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToDayKey(dayKey, mondayOffset);
}

export function weekDayKeys(weekStartDayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDayKey(weekStartDayKey, i));
}

export function formatWeekColumnHeaderDa(dayKey: string): { weekday: string; dayMonth: string } {
  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const weekday = start.toLocaleDateString("da-DK", { timeZone: TZ, weekday: "long" }).toUpperCase();
  const dayMonth = start.toLocaleDateString("da-DK", { timeZone: TZ, day: "numeric", month: "long" });
  return { weekday, dayMonth };
}

export function getIsoWeekNumberDa(dayKey: string): number {
  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const fmt = new Intl.DateTimeFormat("da-DK", {
    timeZone: TZ,
    week: "isoWeek",
  } as Intl.DateTimeFormatOptions);
  const parts = fmt.formatToParts(start);
  const w = parts.find((p) => (p.type as string) === "week")?.value;
  if (w) return parseInt(w, 10);
  const thursday = addDaysToDayKey(dayKey, 3);
  const { y } = parseDayKey(thursday);
  const jan4 = copenhagenDayBoundsUtcFromDayKey(`${y}-01-04`).start;
  const diff = start.getTime() - jan4.getTime();
  return 1 + Math.floor(diff / (7 * 86_400_000));
}

export function formatTimeDa(iso: string | Date): string {
  const p = copenhagenParts(iso);
  if (!p) return "—";
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function isValidWeekStartDayKey(dayKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return false;
  const parts = copenhagenParts(copenhagenDayBoundsUtcFromDayKey(dayKey).start);
  if (!parts) return false;
  const monday = startOfWeekMondayDayKey(copenhagenDayBoundsUtcFromDayKey(dayKey).start);
  return monday === dayKey;
}

export function parseWeekStartParam(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (trimmed && isValidWeekStartDayKey(trimmed)) return trimmed;
  return startOfWeekMondayDayKey();
}

export type MeetingWithSchedule = {
  id: string;
  meetingScheduledFor: string | null;
};

export function filterMeetingsInWeek<T extends MeetingWithSchedule>(
  rows: T[],
  weekStartDayKey: string,
): T[] {
  const keys = new Set(weekDayKeys(weekStartDayKey));
  return rows.filter((r) => {
    const p = copenhagenParts(r.meetingScheduledFor);
    return p != null && keys.has(p.dayKey);
  });
}

export function meetingsForDayKey<T extends MeetingWithSchedule>(
  rows: T[],
  dayKey: string,
): T[] {
  return rows
    .filter((r) => copenhagenParts(r.meetingScheduledFor)?.dayKey === dayKey)
    .sort((a, b) => {
      const ta = new Date(a.meetingScheduledFor!).getTime();
      const tb = new Date(b.meetingScheduledFor!).getTime();
      return ta - tb;
    });
}

export function meetingPlacement(
  iso: string | Date,
  durationMin = MEETING_DEFAULT_DURATION_MIN,
): MeetingCalendarPlacement | null {
  const p = copenhagenParts(iso);
  if (!p) return null;

  const startMin = p.hour * 60 + p.minute;
  const gridStart = MEETING_CALENDAR_HOUR_START * 60;
  const gridEnd = (MEETING_CALENDAR_HOUR_END + 1) * 60;
  const clamped = startMin < gridStart || startMin + durationMin > gridEnd;

  const visibleStart = Math.max(startMin, gridStart);
  const visibleEnd = Math.min(startMin + durationMin, gridEnd);
  const visibleDuration = Math.max(visibleEnd - visibleStart, 15);

  const topPct = ((visibleStart - gridStart) / MEETING_CALENDAR_MINUTES) * 100;
  const heightPct = (visibleDuration / MEETING_CALENDAR_MINUTES) * 100;

  return {
    topPct,
    heightPct: Math.max(heightPct, (30 / MEETING_CALENDAR_MINUTES) * 100),
    clamped,
    actualTimeLabel: formatTimeDa(iso),
  };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function meetingStartEndMin(iso: string, durationMin: number): { start: number; end: number } {
  const p = copenhagenParts(iso)!;
  const start = p.hour * 60 + p.minute;
  return { start, end: start + durationMin };
}

/** Fordel overlappende møder i kolonner (greedy pr. overlap-gruppe). */
export function layoutMeetingColumns(
  meetingIds: string[],
  getScheduledFor: (id: string) => string,
  durationMin = MEETING_DEFAULT_DURATION_MIN,
): Map<string, MeetingColumnLayout> {
  const sorted = [...meetingIds].sort((a, b) => {
    const ta = new Date(getScheduledFor(a)).getTime();
    const tb = new Date(getScheduledFor(b)).getTime();
    return ta - tb;
  });

  const result = new Map<string, MeetingColumnLayout>();
  const groups: string[][] = [];
  let currentGroup: string[] = [];

  function groupOverlaps(id: string): boolean {
    if (currentGroup.length === 0) return false;
    const { start, end } = meetingStartEndMin(getScheduledFor(id), durationMin);
    return currentGroup.some((other) => {
      const o = meetingStartEndMin(getScheduledFor(other), durationMin);
      return rangesOverlap(start, end, o.start, o.end);
    });
  }

  for (const id of sorted) {
    if (currentGroup.length > 0 && !groupOverlaps(id)) {
      groups.push(currentGroup);
      currentGroup = [];
    }
    currentGroup.push(id);
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  for (const group of groups) {
    const cols: string[][] = [];
    for (const id of group) {
      const { start, end } = meetingStartEndMin(getScheduledFor(id), durationMin);
      let placed = false;
      for (let ci = 0; ci < cols.length; ci++) {
        const colHasOverlap = cols[ci].some((otherId) => {
          const o = meetingStartEndMin(getScheduledFor(otherId), durationMin);
          return rangesOverlap(start, end, o.start, o.end);
        });
        if (!colHasOverlap) {
          cols[ci].push(id);
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([id]);
    }
    const columnCount = Math.max(cols.length, 1);
    cols.forEach((colIds, ci) => {
      const widthPct = 100 / columnCount;
      const leftPct = ci * widthPct;
      for (const id of colIds) {
        result.set(id, { leftPct, widthPct, columnIndex: ci, columnCount });
      }
    });
  }

  return result;
}

export function nowLinePercent(now = new Date()): number | null {
  const p = copenhagenParts(now);
  if (!p) return null;
  const min = p.hour * 60 + p.minute;
  const gridStart = MEETING_CALENDAR_HOUR_START * 60;
  const gridEnd = (MEETING_CALENDAR_HOUR_END + 1) * 60;
  if (min < gridStart || min > gridEnd) return null;
  return ((min - gridStart) / MEETING_CALENDAR_MINUTES) * 100;
}

export function todayDayKey(): string {
  return copenhagenDayKey();
}

export function weekContainsDayKey(weekStartDayKey: string, dayKey: string): boolean {
  return weekDayKeys(weekStartDayKey).includes(dayKey);
}
