import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validerer at strengen er på formen YYYY-MM-DD. */
export function isDayKey(v: unknown): v is string {
  return typeof v === "string" && DAY_KEY_RE.test(v);
}

/**
 * Konverterer en YYYY-MM-DD streng (Europe/Copenhagen-dato) til den UTC-DateTime
 * der svarer til *slutningen* af kalenderdagen — 23:59:59.999.
 *
 * Bruges som ticket-deadline så `differenceInHours` rammer den lokale arbejdsdag korrekt
 * uanset sommer-/vintertid.
 */
export function endOfDayUtcFromDayKey(dayKey: string): Date {
  if (!isDayKey(dayKey)) {
    throw new Error("endOfDayUtcFromDayKey: forventet YYYY-MM-DD");
  }
  const { end } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  return new Date(end.getTime() - 1);
}

/**
 * YYYY-MM-DD i Europe/Copenhagen for en given UTC-DateTime — bruges til at vise
 * deadline tilbage til klienten i et neutralt format der kan redigeres i et date-input.
 */
export function dayKeyFromDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
