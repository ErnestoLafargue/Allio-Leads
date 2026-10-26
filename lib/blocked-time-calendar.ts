import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import { intervalsForMeeting } from "@/lib/booking/availability";
import {
  MEETING_CALENDAR_HOUR_START,
  MEETING_CALENDAR_HOURS,
  MEETING_CALENDAR_MINUTES,
} from "@/lib/meeting-week-calendar";
import { MEETING_TYPE_ONLINE, normalizeMeetingType } from "@/lib/meeting-type";

export type BlockedTimeRow = {
  id: string;
  userId: string;
  title: string;
  startDateTime: Date | string;
  endDateTime: Date | string;
  user?: { name: string };
};

export type BlockedTimeSegment = {
  id: string;
  userId: string;
  title: string;
  userName: string | null;
  topPct: number;
  heightPct: number;
  clamped: boolean;
};

function copenhagenPartsFromMs(ms: number): {
  dayKey: string;
  hour: number;
  minute: number;
} | null {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  let hour = parseInt(fmt.find((p) => p.type === "hour")!.value, 10);
  const minute = parseInt(fmt.find((p) => p.type === "minute")!.value, 10);
  if (hour === 24) hour = 0;
  const dayKey = `${fmt.find((p) => p.type === "year")!.value}-${fmt.find((p) => p.type === "month")!.value}-${fmt.find((p) => p.type === "day")!.value}`;
  return { dayKey, hour, minute };
}

export function placementForIntervalOnDay(
  dayKey: string,
  startMs: number,
  endMs: number,
): { topPct: number; heightPct: number; clamped: boolean } | null {
  const { start: dayStart } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const dayEndMs = dayStart.getTime() + 24 * 60 * 60 * 1000;
  const gridStartMin = MEETING_CALENDAR_HOUR_START * 60;
  const gridEndMin = (MEETING_CALENDAR_HOUR_START + MEETING_CALENDAR_HOURS) * 60;

  if (endMs <= dayStart.getTime() || startMs >= dayEndMs) return null;

  const startParts = copenhagenPartsFromMs(Math.max(startMs, dayStart.getTime()));
  const endParts = copenhagenPartsFromMs(Math.min(endMs, dayEndMs) - 1);
  if (!startParts || !endParts || startParts.dayKey !== dayKey) return null;

  const startMin = startParts.hour * 60 + startParts.minute;
  let endMin = endParts.hour * 60 + endParts.minute + 1;
  if (endMs >= dayEndMs) {
    endMin = gridEndMin;
  }

  const visibleStart = Math.max(startMin, gridStartMin);
  const visibleEnd = Math.min(endMin, gridEndMin);
  if (visibleEnd <= visibleStart) return null;

  const clamped = startMin < gridStartMin || endMin > gridEndMin;
  const topPct = ((visibleStart - gridStartMin) / MEETING_CALENDAR_MINUTES) * 100;
  const heightPct = ((visibleEnd - visibleStart) / MEETING_CALENDAR_MINUTES) * 100;

  return {
    topPct,
    heightPct: Math.max(heightPct, (15 / MEETING_CALENDAR_MINUTES) * 100),
    clamped,
  };
}

export function blockedSegmentsForDay(dayKey: string, rows: BlockedTimeRow[]): BlockedTimeSegment[] {
  const out: BlockedTimeSegment[] = [];
  for (const row of rows) {
    const startMs = new Date(row.startDateTime).getTime();
    const endMs = new Date(row.endDateTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue;

    const placement = placementForIntervalOnDay(dayKey, startMs, endMs);
    if (!placement) continue;

    out.push({
      id: row.id,
      userId: row.userId,
      title: row.title.trim() || "Blokeret",
      userName: row.user?.name ?? null,
      ...placement,
    });
  }
  return out;
}

export type TransportSegment = {
  id: string;
  meetingId: string;
  title: string;
  topPct: number;
  heightPct: number;
};

/** Transportblokeringer for fysiske møder på en given dag (beregnet, ikke gemt). */
export function transportSegmentsForDay(
  dayKey: string,
  meetings: {
    id: string;
    meetingScheduledFor: string | Date | null;
    meetingType?: string | null;
  }[],
): TransportSegment[] {
  const out: TransportSegment[] = [];
  for (const m of meetings) {
    if (!m.meetingScheduledFor) continue;
    const type = normalizeMeetingType(m.meetingType ?? MEETING_TYPE_ONLINE);
    const startMs = new Date(m.meetingScheduledFor).getTime();
    if (Number.isNaN(startMs)) continue;
    const { transports } = intervalsForMeeting(startMs, type);
    transports.forEach((t, i) => {
      const placement = placementForIntervalOnDay(dayKey, t.startMs, t.endMs);
      if (!placement) return;
      out.push({
        id: `${m.id}-transport-${i}`,
        meetingId: m.id,
        title: "Transport",
        topPct: placement.topPct,
        heightPct: placement.heightPct,
      });
    });
  }
  return out;
}

/**
 * Konverter Y-position i en dagskolonne til HH:mm på 15-min gitter
 * (Europe/Copenhagen wall clock inden for kalenderens timevindue).
 * Sidste tilladte start er 21:45 (blokering kan slutte 22:00).
 */
export function snapTimeFromColumnClick(
  offsetY: number,
  columnHeightPx: number,
): string {
  const ratio = Math.min(1, Math.max(0, offsetY / Math.max(columnHeightPx, 1)));
  const totalMin = MEETING_CALENDAR_HOURS * 60;
  const minutesFromStart = ratio * totalMin;
  let snapped = Math.floor(minutesFromStart / 15) * 15;
  // Timer 09–22 i gitteret → sidste tilladte blok-start 21:45 (matcher TIME_OPTIONS).
  const maxFromStart = (21 - MEETING_CALENDAR_HOUR_START) * 60 + 45;
  snapped = Math.min(Math.max(0, snapped), maxFromStart);
  const hour = MEETING_CALENDAR_HOUR_START + Math.floor(snapped / 60);
  const minute = snapped % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}`;
}
