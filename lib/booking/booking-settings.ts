/**
 * Booking-regler der kan ændres på Administration → Booking (gemt i AppSetting som JSON).
 * Ren fil (ingen DB) — kan bruges i både server og klient. DB-adgang: lib/booking/booking-settings-db.ts.
 */

/** Onsdag åbner, når alle kørende sælgere er fyldt (samlet), eller pr. sælger. */
export type WednesdayMode = "ALL_SELLERS" | "PER_SELLER";

export type BookingSettings = {
  wednesdayMode: WednesdayMode;
  /** Fysiske møder torsdag og fredag skal hver have (pr. sælger), før onsdag åbner. */
  wednesdayOpensAtMeetingsPerDay: number;
  /** Tidligste start onsdag, når den er åben (minutter efter midnat). */
  wednesdayEarliestStartMin: number;
  /** Hele uger frem efter indeværende uge, der kan bookes i uden admin. */
  horizonWeeks: number;
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  wednesdayMode: "ALL_SELLERS",
  wednesdayOpensAtMeetingsPerDay: 3,
  wednesdayEarliestStartMin: 14 * 60,
  horizonWeeks: 3,
};

export const BOOKING_SETTINGS_KEY = "booking_rules";

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Læs (delvise/ukendte) værdier sikkert — alt ugyldigt falder tilbage til standard. */
export function parseBookingSettings(raw: unknown): BookingSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_BOOKING_SETTINGS;
  const wednesdayStart = intInRange(
    o.wednesdayEarliestStartMin,
    9 * 60,
    17 * 60,
    d.wednesdayEarliestStartMin,
  );
  return {
    wednesdayMode: o.wednesdayMode === "PER_SELLER" ? "PER_SELLER" : "ALL_SELLERS",
    wednesdayOpensAtMeetingsPerDay: intInRange(
      o.wednesdayOpensAtMeetingsPerDay,
      1,
      4,
      d.wednesdayOpensAtMeetingsPerDay,
    ),
    // Hele eller halve timer mellem 09:00 og 17:00.
    wednesdayEarliestStartMin: wednesdayStart % 30 === 0 ? wednesdayStart : d.wednesdayEarliestStartMin,
    horizonWeeks: intInRange(o.horizonWeeks, 1, 12, d.horizonWeeks),
  };
}
