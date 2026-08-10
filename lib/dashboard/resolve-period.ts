import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";
import type { DashboardPeriod } from "@/lib/dashboard/types";

export type ResolvedPeriod = {
  period: DashboardPeriod;
  dayKeys: string[];
  start: Date;
  end: Date;
  label: string;
};

function shiftCopenhagenDayKey(dayKey: string, deltaDays: number): string {
  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const shifted = new Date(start.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return copenhagenDayKey(shifted);
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Mandag–søndag for ugen der indeholder `dayKey` (Europe/Copenhagen). */
export function copenhagenWeekDayKeys(dayKey: string): string[] {
  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const wdName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Copenhagen",
    weekday: "short",
  }).format(start);
  const iso = WEEKDAY_TO_ISO[wdName] ?? 1;
  const mondayKey = shiftCopenhagenDayKey(dayKey, 1 - iso);
  return Array.from({ length: 7 }, (_, i) => shiftCopenhagenDayKey(mondayKey, i));
}

/** Alle dayKeys i måneden for `dayKey`. */
export function copenhagenMonthDayKeys(dayKey: string): string[] {
  const [y, m] = dayKey.split("-").map((s) => parseInt(s, 10));
  const keys: string[] = [];
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  for (let i = 0; i < 31; i++) {
    const k = shiftCopenhagenDayKey(first, i);
    const [ky, km] = k.split("-").map((s) => parseInt(s, 10));
    if (ky !== y || km !== m) break;
    keys.push(k);
  }
  return keys;
}

export function resolveDashboardPeriod(
  period: DashboardPeriod,
  reference = new Date(),
): ResolvedPeriod {
  const today = copenhagenDayKey(reference);
  if (period === "today") {
    const { start, end } = copenhagenDayBoundsUtcFromDayKey(today);
    return { period, dayKeys: [today], start, end, label: "I dag" };
  }
  if (period === "this_week") {
    const dayKeys = copenhagenWeekDayKeys(today);
    const start = copenhagenDayBoundsUtcFromDayKey(dayKeys[0]!).start;
    const end = copenhagenDayBoundsUtcFromDayKey(dayKeys[dayKeys.length - 1]!).end;
    return { period, dayKeys, start, end, label: "Denne uge" };
  }
  const dayKeys = copenhagenMonthDayKeys(today);
  const start = copenhagenDayBoundsUtcFromDayKey(dayKeys[0]!).start;
  const end = copenhagenDayBoundsUtcFromDayKey(dayKeys[dayKeys.length - 1]!).end;
  return { period, dayKeys, start, end, label: "Denne måned" };
}
