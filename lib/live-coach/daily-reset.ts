/**
 * Live-coachens «arbejdsdag»: slår fra ved 08:00 Europe/Copenhagen, så den ikke
 * bliver stående til og bruger credits overnight.
 */
import {
  copenhagenDayBoundsUtcFromDayKey,
  copenhagenDayKey,
} from "@/lib/copenhagen-day";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/** Kalenderdag (YYYY-MM-DD) for den aktuelle coach-periode (skifter kl. 08:00). */
export function liveCoachDayKey(now = new Date()): string {
  const calendarDay = copenhagenDayKey(now);
  const { start: midnight } = copenhagenDayBoundsUtcFromDayKey(calendarDay);
  const eightAm = midnight.getTime() + EIGHT_HOURS_MS;
  if (now.getTime() < eightAm) {
    // Før kl. 08:00 hører vi stadig til gårsdagens coach-dag.
    return copenhagenDayKey(new Date(midnight.getTime() - 60 * 60 * 1000));
  }
  return calendarDay;
}

/** Næste automatiske reset (næste 08:00 Europe/Copenhagen). */
export function nextLiveCoachResetAt(now = new Date()): Date {
  const calendarDay = copenhagenDayKey(now);
  const { start: midnight } = copenhagenDayBoundsUtcFromDayKey(calendarDay);
  const eightAm = new Date(midnight.getTime() + EIGHT_HOURS_MS);
  if (now.getTime() < eightAm.getTime()) return eightAm;
  const tomorrowKey = copenhagenDayKey(new Date(midnight.getTime() + 36 * 60 * 60 * 1000));
  const { start: tomorrowMidnight } = copenhagenDayBoundsUtcFromDayKey(tomorrowKey);
  return new Date(tomorrowMidnight.getTime() + EIGHT_HOURS_MS);
}
