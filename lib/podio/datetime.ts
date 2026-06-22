/**
 * Podio date-felter via app-auth antager UTC (ikke brugerens tidszone).
 * Send derfor UTC-streng, så 09:00 CPH (07:00Z) vises som 09:00 i Podio UI (DK).
 */
export function formatPodioDateTimeUtc(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
