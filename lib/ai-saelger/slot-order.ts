/**
 * Rækkefølgen, AI-mødebookeren tilbyder mødetider i (Ernesto, 13/10): inden for 14 dage, fyldt
 * bagfra i ugen. Fredag før torsdag; er torsdag og fredag fyldt, ugen efter; er begge uger fyldt,
 * onsdag, så tirsdag, så mandag. Mandag og tirsdag kun, hvis kunden ikke kan andre dage.
 */

export type DaySlots = { dayKey: string; times: string[] };

export const BOOKING_HORIZON_DAYS = 14;

/** 1 = mandag … 7 = søndag, ud fra en dagsnøgle "YYYY-MM-DD". */
export function isoWeekday(dayKey: string): number {
  const d = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Hvor mange uger (mandag–søndag) dagen ligger efter den uge, `todayKey` ligger i. */
export function weekOffset(todayKey: string, dayKey: string): number {
  const monday = (k: string) => new Date(`${k}T12:00:00Z`).getTime() - (isoWeekday(k) - 1) * 86_400_000;
  return Math.round((monday(dayKey) - monday(todayKey)) / (7 * 86_400_000));
}

/** Prioritet: fredag/torsdag (uge for uge) → onsdag → tirsdag → mandag. Lavere = tilbydes først. */
function rank(todayKey: string, dayKey: string): number {
  const wd = isoWeekday(dayKey);
  const week = weekOffset(todayKey, dayKey);
  if (wd === 5 || wd === 4) return week * 2 + (wd === 5 ? 0 : 1);
  const group = wd === 3 ? 100 : wd === 2 ? 200 : 300;
  return group + week;
}

export function orderDays(
  todayKey: string,
  days: readonly DaySlots[],
  opts: { allowMondayTuesday?: boolean } = {},
): DaySlots[] {
  const horizonEnd = new Date(`${todayKey}T12:00:00Z`).getTime() + BOOKING_HORIZON_DAYS * 86_400_000;
  return days
    .filter((d) => d.times.length > 0)
    .filter((d) => d.dayKey > todayKey && new Date(`${d.dayKey}T12:00:00Z`).getTime() <= horizonEnd)
    .filter((d) => isoWeekday(d.dayKey) <= 5)
    .filter((d) => opts.allowMondayTuesday || isoWeekday(d.dayKey) >= 3)
    .sort((a, b) => rank(todayKey, a.dayKey) - rank(todayKey, b.dayKey));
}

/** To konkrete forslag («torsdag kl. 10 eller fredag kl. 9?»): de to bedste dage, første ledige tid. */
export function proposeTwo(
  todayKey: string,
  days: readonly DaySlots[],
  opts: { allowMondayTuesday?: boolean } = {},
): { dayKey: string; time: string }[] {
  return orderDays(todayKey, days, opts)
    .slice(0, 2)
    .map((d) => ({ dayKey: d.dayKey, time: [...d.times].sort()[0]! }));
}
