import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  meetingDurationMinutes,
  transportBufferMinutes,
} from "@/lib/booking/meeting-type-buffers";
import {
  MEETING_OUTCOME_PENDING,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";
import {
  MEETING_TYPE_ONLINE,
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
  normalizeMeetingType,
} from "@/lib/meeting-type";

/** 15-minutters gitter som i kalenderen */
export const BOOKING_SLOT_STEP_MIN = 15;

/** @deprecated Brug meetingDurationMinutes / transportBufferMinutes */
export const BOOKING_MEETING_BLOCK_BEFORE_MIN = 60;
/** @deprecated Brug meetingDurationMinutes / transportBufferMinutes */
export const BOOKING_MEETING_BLOCK_AFTER_MIN = 60;
/** @deprecated */
export const BOOKING_MEETING_BLOCK_MIN = BOOKING_MEETING_BLOCK_AFTER_MIN;

/** Starttider pr. mødetype (minutter efter lokal midnat, begge ender inkl.). */
export type BookingStartWindow = { firstStartMin: number; lastStartMin: number; stepMin: number };

/** Fysisk: start 09:00–17:00 hver halve time. */
export const PHYSICAL_BOOKING_WINDOW: BookingStartWindow = {
  firstStartMin: 9 * 60,
  lastStartMin: 17 * 60,
  stepMin: 30,
};

/** Online: start 09:00–17:45 hvert kvarter (dagen slutter 18). */
export const ONLINE_BOOKING_WINDOW: BookingStartWindow = {
  firstStartMin: 9 * 60,
  lastStartMin: 17 * 60 + 45,
  stepMin: BOOKING_SLOT_STEP_MIN,
};

/** Fysiske møder pr. dag, som ledige tider altid skal efterlade plads til. */
export const PHYSICAL_MEETINGS_PER_DAY_TARGET = 3;

export function bookingWindowForMeetingType(type: MeetingType | string): BookingStartWindow {
  return normalizeMeetingType(type) === MEETING_TYPE_PHYSICAL
    ? PHYSICAL_BOOKING_WINDOW
    : ONLINE_BOOKING_WINDOW;
}

/** Lørdag/søndag (dayKey YYYY-MM-DD) — der bookes ikke møder i weekenden. */
export function isWeekendDayKey(dayKey: string): boolean {
  const [y, m, d] = dayKey.split("-").map((x) => parseInt(x, 10));
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export type TimeBlockMs = { startMs: number; endMs: number };

export type CopenhagenBookingSlot = { time: string; utcMs: number };

export type CopenhagenBookingSlotWithAvailability = CopenhagenBookingSlot & { available: boolean };

export type MeetingIntervals = {
  meeting: TimeBlockMs;
  transports: TimeBlockMs[];
};

/** Åbne intervaller [aStart,aEnd) og [bStart,bEnd) */
export function intervalsOverlapExclusiveEnd(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function blockOverlaps(a: TimeBlockMs, b: TimeBlockMs): boolean {
  return intervalsOverlapExclusiveEnd(a.startMs, a.endMs, b.startMs, b.endMs);
}

export function anyBlockOverlaps(candidate: TimeBlockMs, blocks: TimeBlockMs[]): boolean {
  return blocks.some((b) => blockOverlaps(candidate, b));
}

/** Møde-body + transportintervaller for et planlagt møde. */
export function intervalsForMeeting(
  startMs: number,
  type: MeetingType | string,
): MeetingIntervals {
  const durationMin = meetingDurationMinutes(type);
  const transportMin = transportBufferMinutes(type);
  const meetingEnd = startMs + durationMin * 60 * 1000;
  const transports: TimeBlockMs[] = [];
  if (transportMin > 0) {
    transports.push({
      startMs: startMs - transportMin * 60 * 1000,
      endMs: startMs,
    });
    transports.push({
      startMs: meetingEnd,
      endMs: meetingEnd + transportMin * 60 * 1000,
    });
  }
  return {
    meeting: { startMs, endMs: meetingEnd },
    transports,
  };
}

/** Hard-blok: møde + transport (blokerer andres møde-body). */
export function hardBlocksForMeeting(startMs: number, type: MeetingType | string): TimeBlockMs[] {
  const { meeting, transports } = intervalsForMeeting(startMs, type);
  return [meeting, ...transports];
}

/** Soft-blok: kun møde-body (blokerer andres transportplacering). */
export function softBlocksForMeeting(startMs: number, type: MeetingType | string): TimeBlockMs[] {
  return [intervalsForMeeting(startMs, type).meeting];
}

/**
 * Kan vi booke et møde af typen `proposedType` på `proposedStart`?
 * - Møde-body må ikke overlappe hard (møde+transport+manuel blokering).
 * - Egen transport må ikke overlappe soft (andres møde-body); transport↔transport er OK.
 * - Manuel blokering er hard, ikke soft — transport må gerne overlappe en blokering,
 *   så fysisk møde kan starte når blokeringen slutter.
 */
export function canBookMeetingAt(
  proposedStartMs: number,
  proposedType: MeetingType | string,
  hardBlocks: TimeBlockMs[],
  softBlocks: TimeBlockMs[],
): boolean {
  if (Number.isNaN(proposedStartMs)) return false;
  const { meeting, transports } = intervalsForMeeting(proposedStartMs, proposedType);
  if (anyBlockOverlaps(meeting, hardBlocks)) return false;
  for (const t of transports) {
    if (anyBlockOverlaps(t, softBlocks)) return false;
  }
  return true;
}

/** @deprecated */
export function getMeetingBlockStartMs(startMs: number, blockBeforeMinutes: number = 60): number {
  return startMs - blockBeforeMinutes * 60 * 1000;
}

/** @deprecated */
export function getMeetingBlockEndMs(startMs: number, blockAfterMinutes: number = 60): number {
  return startMs + blockAfterMinutes * 60 * 1000;
}

export function isSlotStartBlocked(
  slotStartMs: number,
  _slotDurationMin: number,
  occupied: TimeBlockMs[],
): boolean {
  for (const o of occupied) {
    if (slotStartMs > o.startMs && slotStartMs < o.endMs) {
      return true;
    }
  }
  return false;
}

type ScheduledMeetingRow = {
  meetingScheduledFor: Date | null;
  meetingOutcomeStatus?: string | null;
  meetingType?: string | null;
  /** @deprecated Ignoreres — brug meetingType. */
  blockMinutes?: number | null;
};

/** Hard-blokke (møde + transport) fra planlagte leads. */
export function occupiedBlocksFromScheduledMeetings(
  rows: ScheduledMeetingRow[],
  _opts?: { blockBeforeMinutes?: number; blockAfterMinutes?: number },
): TimeBlockMs[] {
  const out: TimeBlockMs[] = [];
  for (const row of rows) {
    if (!row.meetingScheduledFor) continue;
    if (normalizeMeetingOutcomeStatus(row.meetingOutcomeStatus) !== MEETING_OUTCOME_PENDING) {
      continue;
    }
    const startMs = row.meetingScheduledFor.getTime();
    if (Number.isNaN(startMs)) continue;
    out.push(...hardBlocksForMeeting(startMs, row.meetingType ?? MEETING_TYPE_ONLINE));
  }
  return out;
}

/** Soft-blokke (kun møde-body) fra planlagte leads. */
export function softOccupiedBlocksFromScheduledMeetings(rows: ScheduledMeetingRow[]): TimeBlockMs[] {
  const out: TimeBlockMs[] = [];
  for (const row of rows) {
    if (!row.meetingScheduledFor) continue;
    if (normalizeMeetingOutcomeStatus(row.meetingOutcomeStatus) !== MEETING_OUTCOME_PENDING) {
      continue;
    }
    const startMs = row.meetingScheduledFor.getTime();
    if (Number.isNaN(startMs)) continue;
    out.push(...softBlocksForMeeting(startMs, row.meetingType ?? MEETING_TYPE_ONLINE));
  }
  return out;
}

/**
 * Optagne hard-blokke fra Allio-Native occupancy.
 * Bruger start + mødetype (via resolveMeetingType) — ikke buffer oven på Native-slut.
 */
export function occupiedBlocksFromNativeOccupancy(
  rows: {
    startDateTime: Date;
    endDateTime: Date;
    serviceIds?: string | null;
    /** Eksplicit mødetype. */
    meetingType?: MeetingType | string | null;
    /** @deprecated Map til transport; foretræk meetingType. */
    bufferMinutes?: number | null;
  }[],
  resolveMeetingType?: (serviceIds: string | null | undefined) => MeetingType | string,
): TimeBlockMs[] {
  const out: TimeBlockMs[] = [];
  for (const row of rows) {
    const startMs = row.startDateTime.getTime();
    if (Number.isNaN(startMs)) continue;
    let type: MeetingType | string =
      row.meetingType != null
        ? normalizeMeetingType(row.meetingType)
        : resolveMeetingType
          ? resolveMeetingType(row.serviceIds)
          : MEETING_TYPE_ONLINE;
    // Legacy: bufferMinutes sat uden type — fysisk hvis buffer ≥ 60, ellers online.
    if (row.meetingType == null && !resolveMeetingType && typeof row.bufferMinutes === "number") {
      type =
        row.bufferMinutes >= transportBufferMinutes("PHYSICAL")
          ? "PHYSICAL"
          : MEETING_TYPE_ONLINE;
    }
    out.push(...hardBlocksForMeeting(startMs, type));
  }
  return out;
}

export function softOccupiedBlocksFromNativeOccupancy(
  rows: {
    startDateTime: Date;
    endDateTime: Date;
    serviceIds?: string | null;
    meetingType?: MeetingType | string | null;
  }[],
  resolveMeetingType?: (serviceIds: string | null | undefined) => MeetingType | string,
): TimeBlockMs[] {
  const out: TimeBlockMs[] = [];
  for (const row of rows) {
    const startMs = row.startDateTime.getTime();
    if (Number.isNaN(startMs)) continue;
    const type =
      row.meetingType != null
        ? normalizeMeetingType(row.meetingType)
        : resolveMeetingType
          ? resolveMeetingType(row.serviceIds)
          : MEETING_TYPE_ONLINE;
    out.push(...softBlocksForMeeting(startMs, type));
  }
  return out;
}

export function isPastCopenhagenDayKey(dayKey: string): boolean {
  const today = copenhagenDayKey();
  return dayKey < today;
}

/**
 * Alle 15-min starttider — tilgængelighed via hard-blokke (start inde i blok).
 * Foretræk getCopenhagenBookingSlotsForMeetingType når mødetype er kendt.
 */
export function getCopenhagenBookingSlotsWithAvailability(
  dayKey: string,
  occupied: TimeBlockMs[],
): CopenhagenBookingSlotWithAvailability[] {
  return getCopenhagenBookingSlotsForMeetingType(dayKey, MEETING_TYPE_ONLINE, occupied, occupied);
}

const COPENHAGEN_YMD_HM_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Starttider (UTC-ms + «HH:MM») i mødetypens vindue for dagen — passerede tider i dag udeladt. */
function candidateStartsForDay(dayKey: string, window: BookingStartWindow): CopenhagenBookingSlot[] {
  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const dayEnd = start.getTime() + 24 * 60 * 60 * 1000;
  const now = Date.now();
  const isToday = dayKey === copenhagenDayKey();
  const out: CopenhagenBookingSlot[] = [];

  // Midnat og sommertidsskift ligger på hele timer, så gitteret fra midnat rammer altid :00/:15/:30/:45.
  for (let ms = start.getTime(); ms < dayEnd; ms += window.stepMin * 60 * 1000) {
    const parts = COPENHAGEN_YMD_HM_FMT.formatToParts(new Date(ms));
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    if (`${part("year")}-${part("month")}-${part("day")}` !== dayKey) continue;

    const h = parseInt(part("hour"), 10) % 24;
    const m = parseInt(part("minute"), 10);
    const minuteOfDay = h * 60 + m;
    if (minuteOfDay < window.firstStartMin || minuteOfDay > window.lastStartMin) continue;
    if (isToday && ms < now) continue;

    out.push({ time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, utcMs: ms });
  }
  return out;
}

/**
 * Hvor mange ekstra fysiske møder kan der maksimalt lægges ind blandt `startsMs` (sorteret)?
 * Grådig «tidligst mulige» er optimal, fordi alle fysiske møder er lige lange.
 */
export function maxAdditionalPhysicalMeetings(
  startsMs: number[],
  hardBlocks: TimeBlockMs[],
  softBlocks: TimeBlockMs[],
): number {
  const hard = [...hardBlocks];
  const soft = [...softBlocks];
  let count = 0;
  for (const ms of startsMs) {
    if (!canBookMeetingAt(ms, MEETING_TYPE_PHYSICAL, hard, soft)) continue;
    count++;
    hard.push(...hardBlocksForMeeting(ms, MEETING_TYPE_PHYSICAL));
    soft.push(...softBlocksForMeeting(ms, MEETING_TYPE_PHYSICAL));
  }
  return count;
}

export type BookingSlotsOptions = {
  /** Fysiske møder der allerede er booket på dagen (tæller med i målet på 3). */
  physicalMeetingsBookedOnDay?: number;
};

/**
 * Ledige slots for en given mødetype med hard/soft-blokke.
 *
 * Fysisk: dynamiske tider — en tid er kun ledig, hvis dagen bagefter stadig kan nå
 * PHYSICAL_MEETINGS_PER_DAY_TARGET fysiske møder (eller så mange som overhovedet kan nås).
 * Fx tom dag: alle 09:00–17:00. Booket 12:30: kun 09:00–10:00 og 15:00–17:00.
 */
export function getCopenhagenBookingSlotsForMeetingType(
  dayKey: string,
  meetingType: MeetingType | string,
  hardBlocks: TimeBlockMs[],
  softBlocks: TimeBlockMs[],
  opts: BookingSlotsOptions = {},
): CopenhagenBookingSlotWithAvailability[] {
  if (isPastCopenhagenDayKey(dayKey) || isWeekendDayKey(dayKey)) return [];

  const type = normalizeMeetingType(meetingType);
  const candidates = candidateStartsForDay(dayKey, bookingWindowForMeetingType(type));
  const withBasic = candidates.map((s) => ({
    ...s,
    available: canBookMeetingAt(s.utcMs, type, hardBlocks, softBlocks),
  }));
  if (type !== MEETING_TYPE_PHYSICAL) return withBasic;

  const startsMs = candidates.map((s) => s.utcMs);
  const booked = Math.max(0, opts.physicalMeetingsBookedOnDay ?? 0);
  const stillWanted = Math.max(0, PHYSICAL_MEETINGS_PER_DAY_TARGET - booked);
  const required = Math.min(
    stillWanted,
    maxAdditionalPhysicalMeetings(startsMs, hardBlocks, softBlocks),
  );
  if (required <= 1) return withBasic;

  return withBasic.map((s) => {
    if (!s.available) return s;
    const hard = [...hardBlocks, ...hardBlocksForMeeting(s.utcMs, type)];
    const soft = [...softBlocks, ...softBlocksForMeeting(s.utcMs, type)];
    const reachable = 1 + maxAdditionalPhysicalMeetings(startsMs, hard, soft);
    return reachable >= required ? s : { ...s, available: false };
  });
}

export function getAvailableCopenhagenBookingSlots(
  dayKey: string,
  occupied: TimeBlockMs[],
): CopenhagenBookingSlot[] {
  return getCopenhagenBookingSlotsWithAvailability(dayKey, occupied)
    .filter((s) => s.available)
    .map(({ time, utcMs }) => ({ time, utcMs }));
}

export function parseOccupiedBlocksFromApi(
  blocks: { start: string; end: string }[] | undefined,
): TimeBlockMs[] {
  if (!blocks?.length) return [];
  const out: TimeBlockMs[] = [];
  for (const b of blocks) {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) continue;
    out.push({ startMs: s, endMs: e });
  }
  return out;
}

export type BlockedTimeRow = {
  id: string;
  title: string;
  startDateTime: Date | string;
  endDateTime: Date | string;
};

export function occupiedBlocksFromBlockedTimes(
  rows: Pick<BlockedTimeRow, "startDateTime" | "endDateTime">[],
): TimeBlockMs[] {
  const out: TimeBlockMs[] = [];
  for (const row of rows) {
    const startMs = new Date(row.startDateTime).getTime();
    const endMs = new Date(row.endDateTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue;
    out.push({ startMs, endMs });
  }
  return out;
}

export function assertSlotNotBlocked(
  slotStartMs: number,
  blockedRows: Pick<BlockedTimeRow, "startDateTime" | "endDateTime">[],
): void {
  const occupied = occupiedBlocksFromBlockedTimes(blockedRows);
  if (isSlotStartBlocked(slotStartMs, BOOKING_SLOT_STEP_MIN, occupied)) {
    throw new Error("SLOT_BLOCKED");
  }
}

export function findBlockedTimeConflict(
  proposedStart: Date,
  blockedRows: BlockedTimeRow[],
  meetingType: MeetingType | string = MEETING_TYPE_ONLINE,
): { id: string; title: string } | null {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const manual = occupiedBlocksFromBlockedTimes(blockedRows);
  const { meeting } = intervalsForMeeting(startMs, meetingType);
  // Kun møde-body mod manuel blokering — transport må gerne overlappe blokeringen.
  for (const row of blockedRows) {
    const blockStart = new Date(row.startDateTime).getTime();
    const blockEnd = new Date(row.endDateTime).getTime();
    if (Number.isNaN(blockStart) || Number.isNaN(blockEnd) || blockEnd <= blockStart) continue;
    const block = { startMs: blockStart, endMs: blockEnd };
    if (blockOverlaps(meeting, block)) {
      return { id: row.id, title: row.title.trim() || "Blokeret" };
    }
  }
  // Fallback: start inde i manuel blok (når ingen type-intervaller matcher edge-cases).
  if (isSlotStartBlocked(startMs, BOOKING_SLOT_STEP_MIN, manual)) {
    for (const row of blockedRows) {
      const blockStart = new Date(row.startDateTime).getTime();
      const blockEnd = new Date(row.endDateTime).getTime();
      if (startMs > blockStart && startMs < blockEnd) {
        return { id: row.id, title: row.title.trim() || "Blokeret" };
      }
    }
  }
  return null;
}

export function blockedTimeConflictMessage(title: string): string {
  return `Tidspunktet er blokeret (${title}) og kan ikke bookes.`;
}

export function findBookingTimeConflict(
  proposedStart: Date,
  existingRows: {
    id: string;
    meetingScheduledFor: Date | null;
    meetingOutcomeStatus: string | null;
    meetingType?: string | null;
  }[],
  opts?: {
    /** @deprecated Ignoreres. */
    blockBeforeMinutes?: number;
    blockAfterMinutes?: number;
    proposedMeetingType?: MeetingType | string;
  },
): { id: string } | null {
  const startMs = proposedStart.getTime();
  if (Number.isNaN(startMs)) return null;
  const proposedType = opts?.proposedMeetingType ?? MEETING_TYPE_ONLINE;
  const proposed = intervalsForMeeting(startMs, proposedType);

  for (const row of existingRows) {
    if (!row.meetingScheduledFor) continue;
    if (normalizeMeetingOutcomeStatus(row.meetingOutcomeStatus) !== MEETING_OUTCOME_PENDING) {
      continue;
    }
    const otherStart = row.meetingScheduledFor.getTime();
    if (Number.isNaN(otherStart)) continue;
    const otherType = row.meetingType ?? MEETING_TYPE_ONLINE;
    const other = intervalsForMeeting(otherStart, otherType);
    const otherHard = [other.meeting, ...other.transports];
    const otherSoft = [other.meeting];

    if (anyBlockOverlaps(proposed.meeting, otherHard)) return { id: row.id };
    for (const t of proposed.transports) {
      if (anyBlockOverlaps(t, otherSoft)) return { id: row.id };
    }
    // Symmetrisk: andens transport må ikke overlappe vores møde (dækket af otherHard),
    // andens møde må ikke overlappe vores transport:
    for (const t of other.transports) {
      if (blockOverlaps(t, proposed.meeting)) return { id: row.id };
    }
  }
  return null;
}
