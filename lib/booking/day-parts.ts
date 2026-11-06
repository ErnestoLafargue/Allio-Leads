/**
 * Dagens tre grupper i tidsvælgeren. Grænserne følger 3-møder-matematikken for fysiske møder
 * (90 min + 60 min transport ⇒ 2½ time mellem starttider):
 * møde 1 kan starte 09:00–12:00, møde 2 11:30–14:30, møde 3 14:00–17:00 — delt på midten af overlappet.
 */
export type BookingDayPart = "MORNING" | "MIDDAY" | "AFTERNOON";

export const BOOKING_DAY_PARTS: { key: BookingDayPart; label: string }[] = [
  { key: "MORNING", label: "Morgen" },
  { key: "MIDDAY", label: "Middag" },
  { key: "AFTERNOON", label: "Eftermiddag" },
];

/** Middag starter 12:00. */
const MIDDAY_FROM_MIN = 12 * 60;
/** Eftermiddag starter 14:30. */
const AFTERNOON_FROM_MIN = 14 * 60 + 30;

/** «HH:MM» → gruppe. */
export function bookingDayPartForTime(time: string): BookingDayPart {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  const minuteOfDay = h * 60 + m;
  if (minuteOfDay < MIDDAY_FROM_MIN) return "MORNING";
  if (minuteOfDay < AFTERNOON_FROM_MIN) return "MIDDAY";
  return "AFTERNOON";
}
