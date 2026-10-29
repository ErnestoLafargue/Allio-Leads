/**
 * Delte formattere — `new Intl.DateTimeFormat(...)` er dyr (ca. 1 ms + ICU-hukommelse pr. instans),
 * så de oprettes én gang pr. modul i stedet for i hver løkke-iteration.
 */
const COPENHAGEN_YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const COPENHAGEN_YMD_HM_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Scan-trin: lokal midnat i København ligger altid på et helt UTC-kvarter (reelt en hel time). */
const MIDNIGHT_SCAN_STEP_MS = 15 * 60 * 1000;

/** dayKey → UTC-ms for lokal midnat (deterministisk, så sikker at genbruge). */
const midnightMsCache = new Map<string, number>();
const MIDNIGHT_CACHE_MAX = 5000;

/** Første UTC-tidspunkt i [D-1, D+2) hvor Europe/Copenhagen viser `dayKey` kl. 00:00. */
function findCopenhagenMidnightMs(dayKey: string, Y: number, M: number, D: number): number | null {
  const cached = midnightMsCache.get(dayKey);
  if (cached !== undefined) return cached;
  const scanStart = Date.UTC(Y, M - 1, D - 1, 0, 0, 0);
  const scanEnd = Date.UTC(Y, M - 1, D + 2, 0, 0, 0);
  for (let ms = scanStart; ms < scanEnd; ms += MIDNIGHT_SCAN_STEP_MS) {
    const fmt = COPENHAGEN_YMD_HM_FMT.formatToParts(new Date(ms));
    const py = fmt.find((p) => p.type === "year")!.value;
    const pm = fmt.find((p) => p.type === "month")!.value;
    const pd = fmt.find((p) => p.type === "day")!.value;
    const ph = fmt.find((p) => p.type === "hour")!.value;
    const pmin = fmt.find((p) => p.type === "minute")!.value;
    // Node/ICU med en-CA kan bruge time «24» for midnat, ikke «00».
    const isMidnight = pmin === "00" && (ph === "00" || ph === "24");
    if (`${py}-${pm}-${pd}` === dayKey && isMidnight) {
      if (midnightMsCache.size >= MIDNIGHT_CACHE_MAX) midnightMsCache.clear();
      midnightMsCache.set(dayKey, ms);
      return ms;
    }
  }
  return null;
}

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
  const startMs = findCopenhagenMidnightMs(dayKey, Y, M, D);
  if (startMs === null) {
    throw new Error(`copenhagenDayBoundsUtcFromDayKey: kunne ikke finde midnat for ${dayKey}`);
  }
  const start = new Date(startMs);
  const end = new Date(startMs + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** YYYY-MM-DD for kalenderdagen i Europe/Copenhagen (til login-scoreboard). */
export function copenhagenDayKey(reference = new Date()): string {
  return COPENHAGEN_YMD_FMT.format(reference);
}

/**
 * Interval [start, end) i UTC for kalenderdagen i Europe/Copenhagen som indeholder `reference`.
 */
export function copenhagenDayBoundsUtc(reference = new Date()): { start: Date; end: Date } {
  const ymd = COPENHAGEN_YMD_FMT.format(reference);
  const [Y, M, D] = ymd.split("-").map((s) => parseInt(s, 10));
  const startMs = findCopenhagenMidnightMs(ymd, Y, M, D);
  if (startMs === null) {
    throw new Error("copenhagenDayBoundsUtc: kunne ikke finde midnat (Europe/Copenhagen)");
  }
  const start = new Date(startMs);
  const end = new Date(startMs + 24 * 60 * 60 * 1000);
  return { start, end };
}
