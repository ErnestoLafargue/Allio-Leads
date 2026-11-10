/**
 * Ugedagsregler for FYSISKE møder (online er ikke omfattet):
 * - Mandag og tirsdag er salgsdage — ingen fysiske møder.
 * - Torsdag og fredag er mødedage (op til 4 fysiske møder pr. dag).
 * - Onsdag er lukket, indtil torsdag OG fredag i samme uge hver har mindst
 *   WEDNESDAY_OPENS_AT_MEETINGS_PER_DAY fysiske møder. Så åbner onsdag kun fra kl. 14:00
 *   (møde 3 og 4) — formiddagen er stadig salgstid.
 * Admin kan overskrive alt via «Admin»-fluebenet.
 */

/** Fysiske møder torsdag og fredag skal hver have, før onsdag åbner (3 af 4). */
export const WEDNESDAY_OPENS_AT_MEETINGS_PER_DAY = 3;

/** Tidligste start onsdag, når den er åben (minutter efter midnat). */
export const WEDNESDAY_EARLIEST_START_MIN = 14 * 60;

/** ISO-ugedage (man=1 … søn=7) uden fysiske møder. */
export const PHYSICAL_CLOSED_ISO_WEEKDAYS = [1, 2] as const;

export type PhysicalDayStatus =
  /** Torsdag/fredag — normal booking. */
  | "OPEN"
  /** Mandag/tirsdag — salgsdag. */
  | "SALES_DAY"
  /** Onsdag, men torsdag/fredag er ikke fyldt nok endnu. */
  | "WEDNESDAY_LOCKED"
  /** Onsdag åbnet — kun fra kl. 14:00. */
  | "WEDNESDAY_AFTERNOON"
  /** Lørdag/søndag. */
  | "WEEKEND";

export type PhysicalDayRule = {
  status: PhysicalDayStatus;
  /** Kun for onsdag: fysiske møder torsdag/fredag samme uge. */
  thursdayCount?: number;
  fridayCount?: number;
  /** Tidligste start (minutter efter midnat) hvis dagen er delvist åben. */
  earliestStartMin?: number;
};

function utcDateFromDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/** man=1 … søn=7 for YYYY-MM-DD. */
export function isoWeekdayOfDayKey(dayKey: string): number {
  return ((utcDateFromDayKey(dayKey).getUTCDay() + 6) % 7) + 1;
}

export function addDaysToDayKey(dayKey: string, days: number): string {
  const d = utcDateFromDayKey(dayKey);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Torsdag og fredag i samme uge som onsdag `wednesdayKey`. */
export function thursdayFridayOfWeek(wednesdayKey: string): { thursday: string; friday: string } {
  return { thursday: addDaysToDayKey(wednesdayKey, 1), friday: addDaysToDayKey(wednesdayKey, 2) };
}

/**
 * Status for fysiske møder på `dayKey`. For onsdag skal antallet af fysiske møder
 * torsdag/fredag samme uge gives med (ellers regnes onsdag som lukket).
 */
export function physicalDayRule(
  dayKey: string,
  counts?: { thursday: number; friday: number },
  rules: { opensAtMeetingsPerDay?: number; earliestStartMin?: number } = {},
): PhysicalDayRule {
  const opensAt = rules.opensAtMeetingsPerDay ?? WEDNESDAY_OPENS_AT_MEETINGS_PER_DAY;
  const wd = isoWeekdayOfDayKey(dayKey);
  if (wd >= 6) return { status: "WEEKEND" };
  if ((PHYSICAL_CLOSED_ISO_WEEKDAYS as readonly number[]).includes(wd)) {
    return { status: "SALES_DAY" };
  }
  if (wd !== 3) return { status: "OPEN" };

  const thursdayCount = counts?.thursday ?? 0;
  const fridayCount = counts?.friday ?? 0;
  const open = thursdayCount >= opensAt && fridayCount >= opensAt;
  return open
    ? {
        status: "WEDNESDAY_AFTERNOON",
        thursdayCount,
        fridayCount,
        earliestStartMin: rules.earliestStartMin ?? WEDNESDAY_EARLIEST_START_MIN,
      }
    : { status: "WEDNESDAY_LOCKED", thursdayCount, fridayCount };
}

/** Tekst til panelet, når dagen er lukket for fysiske møder (null = dagen kan bookes). */
export function physicalDayRuleMessage(rule: PhysicalDayRule): string | null {
  switch (rule.status) {
    case "SALES_DAY":
      return "Mandag og tirsdag er salgsdage — der bookes ikke fysiske møder.";
    case "WEDNESDAY_LOCKED":
      return "Onsdag er lukket for fysiske møder.";
    default:
      return null;
  }
}
