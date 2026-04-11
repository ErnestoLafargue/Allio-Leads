/**
 * Dato-strenge fra CSV/customFields (dansk dd.mm.yyyy, ISO-dato, fuld ISO med tid).
 */

export function parseDateStringLoose(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  const dmY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (dmY) {
    const d = parseInt(dmY[1], 10);
    const m = parseInt(dmY[2], 10) - 1;
    const y = parseInt(dmY[3], 10);
    const dt = new Date(y, m, d);
    if (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) {
      dt.setHours(0, 0, 0, 0);
      return dt.getTime();
    }
  }

  const ymd = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/i.exec(s);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    const dt = new Date(y, m, d);
    if (!Number.isNaN(dt.getTime())) {
      dt.setHours(0, 0, 0, 0);
      return dt.getTime();
    }
  }

  const t = new Date(s).getTime();
  if (Number.isFinite(t)) {
    const dt = new Date(t);
    if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
      dt.setHours(0, 0, 0, 0);
    }
    return dt.getTime();
  }
  return null;
}

/** Kalenderdag som YYYY-MM-DD (lokal dato for tidsstempel). */
export function localDayKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Sortering: danske datostrenge som dd.mm.yyyy; ellers fuld Date-parsing (fx møde-ISO med klokkeslæt).
 */
export function timestampForSort(raw: string): number {
  const s = raw.trim();
  if (!s) return Number.NaN;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
    return parseDateStringLoose(s) ?? Number.NaN;
  }
  const n = new Date(s).getTime();
  if (Number.isFinite(n)) return n;
  return parseDateStringLoose(s) ?? Number.NaN;
}
