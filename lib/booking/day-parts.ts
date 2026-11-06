/** En gruppe i tidsvælgeren: tider fra `fromMin` (minutter efter midnat) frem til næste gruppe. */
export type BookingTimeGroup = { key: string; label: string; fromMin: number };

/**
 * Morgen/Middag/Eftermiddag — bruges ved «Overskrid» (3 møder) og online. Grænserne følger
 * 3-møder-matematikken (2½ time mellem starter): møde 1 kan starte 09:00–12:00,
 * møde 2 11:30–14:30, møde 3 14:00–17:00 — delt på midten af overlappet.
 */
export const DAY_PART_GROUPS: BookingTimeGroup[] = [
  { key: "MORNING", label: "Morgen", fromMin: 0 },
  { key: "MIDDAY", label: "Middag", fromMin: 12 * 60 },
  { key: "AFTERNOON", label: "Eftermiddag", fromMin: 14 * 60 + 30 },
];

/**
 * Standard for fysiske møder (4 pr. dag): 09:00/09:30 · 11:30/12:00 · 14:00/14:30 · 16:30/17:00.
 * Grænserne ligger midt imellem, så tider fra fallback (kun 3 mulige) også lander i nærmeste møde.
 */
export const FOUR_MEETING_GROUPS: BookingTimeGroup[] = [
  { key: "M1", label: "Møde 1", fromMin: 0 },
  { key: "M2", label: "Møde 2", fromMin: 10 * 60 + 45 },
  { key: "M3", label: "Møde 3", fromMin: 13 * 60 + 15 },
  { key: "M4", label: "Møde 4", fromMin: 15 * 60 + 45 },
];

/** «HH:MM» → nøglen på den gruppe tiden hører til. */
export function bookingGroupKeyForTime(time: string, groups: BookingTimeGroup[]): string {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  const minuteOfDay = h * 60 + m;
  let key = groups[0].key;
  for (const g of groups) if (minuteOfDay >= g.fromMin) key = g.key;
  return key;
}
