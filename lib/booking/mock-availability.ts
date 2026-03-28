/**
 * Kalenderdage / slot-grid — bookede møder frasorteres via API + lib/booking/availability.
 */

import { getAvailableCopenhagenBookingSlots } from "./availability";

export type BookingDateKey = string;

export function toDateKeyLocal(d: Date): BookingDateKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKeyLocal(key: BookingDateKey): Date {
  const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Trim dato til midt på dagen lokalt (sammenligning uden tid). */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function isPastLocalDay(d: Date): boolean {
  const t = startOfLocalDay(new Date()).getTime();
  return startOfLocalDay(d).getTime() < t;
}

/** YYYY-MM-DD for kalenderdagen i Europe/Copenhagen (matcher booking-API). */
export function toCopenhagenDateKey(d: Date): BookingDateKey {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * 15-min slots 09–17 Europe/Copenhagen uden 75-min bookinger (ingen DB — kun tom occupied).
 */
export function getMockAvailableTimeSlots(date: Date): string[] {
  return getAvailableCopenhagenBookingSlots(toCopenhagenDateKey(date), []).map((s) => s.time);
}

/** Sandt hvis der findes mindst ét ledigt slot (inkl. efter bookinger hvis kaldet med occupied fra API). */
export function mockDayHasAvailability(date: Date): boolean {
  return getMockAvailableTimeSlots(date).length > 0;
}
