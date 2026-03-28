/**
 * UTC-interval [start, end) for kalenderdagen `dayKey` (YYYY-MM-DD) i Europe/Copenhagen.
 */
export function copenhagenDayBoundsUtcFromDayKey(dayKey: string): { start: Date; end: Date } {
  const parts = dayKey.split("-");
  if (parts.length !== 3) {
    throw new Error("copenhagenDayBoundsUtcFromDayKey: forventet YYYY-MM-DD");
  }
  const Y = parseInt(parts[0], 10);
  const M = parseInt(parts[1], 10);
  const D = parseInt(parts[2], 10);
  if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) {
    throw new Error("copenhagenDayBoundsUtcFromDayKey: ugyldig dato");
  }
  let start: Date | undefined;
  const scanStart = Date.UTC(Y, M - 1, D - 1, 0, 0, 0);
  const scanEnd = Date.UTC(Y, M - 1, D + 2, 0, 0, 0);
  for (let ms = scanStart; ms < scanEnd; ms += 60 * 1000) {
    const d = new Date(ms);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Copenhagen",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const py = fmt.find((p) => p.type === "year")!.value;
    const pm = fmt.find((p) => p.type === "month")!.value;
    const pd = fmt.find((p) => p.type === "day")!.value;
    const ph = fmt.find((p) => p.type === "hour")!.value;
    const pmin = fmt.find((p) => p.type === "minute")!.value;
    if (`${py}-${pm}-${pd}` === dayKey && ph === "00" && pmin === "00") {
      start = d;
      break;
    }
  }
  if (!start) {
    throw new Error(`copenhagenDayBoundsUtcFromDayKey: kunne ikke finde midnat for ${dayKey}`);
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** YYYY-MM-DD for kalenderdagen i Europe/Copenhagen (til login-scoreboard). */
export function copenhagenDayKey(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

/**
 * Interval [start, end) i UTC for kalenderdagen i Europe/Copenhagen som indeholder `reference`.
 */
export function copenhagenDayBoundsUtc(reference = new Date()): { start: Date; end: Date } {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);

  let start: Date | undefined;
  const [Y, M, D] = ymd.split("-").map((s) => parseInt(s, 10));
  const scanStart = Date.UTC(Y, M - 1, D - 1, 0, 0, 0);
  const scanEnd = Date.UTC(Y, M - 1, D + 2, 0, 0, 0);
  for (let ms = scanStart; ms < scanEnd; ms += 60 * 1000) {
    const d = new Date(ms);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Copenhagen",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const py = parts.find((p) => p.type === "year")!.value;
    const pm = parts.find((p) => p.type === "month")!.value;
    const pd = parts.find((p) => p.type === "day")!.value;
    const ph = parts.find((p) => p.type === "hour")!.value;
    const pmin = parts.find((p) => p.type === "minute")!.value;
    if (`${py}-${pm}-${pd}` === ymd && ph === "00" && pmin === "00") {
      start = d;
      break;
    }
  }
  if (!start) {
    throw new Error("copenhagenDayBoundsUtc: kunne ikke finde midnat (Europe/Copenhagen)");
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
