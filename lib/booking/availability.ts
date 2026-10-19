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

/** Arbejdsvindue: 09:00–22:00 (22 ekskl.) */
export const BOOKING_DAY_WINDOW = { startH: 9, endH: 22 } as const;

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
 * - Møde-body må ikke overlappe hard (møde+transport+manuel).
 * - Egen transport må ikke overlappe soft (møde+manuel); transport↔transport er OK.
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

/**
 * Ledige slots for en given mødetype med hard/soft-blokke.
 */
export function getCopenhagenBookingSlotsForMeetingType(
  dayKey: string,
  meetingType: MeetingType | string,
  hardBlocks: TimeBlockMs[],
  softBlocks: TimeBlockMs[],
): CopenhagenBookingSlotWithAvailability[] {
  if (isPastCopenhagenDayKey(dayKey)) return [];

  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const dayEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const now = Date.now();
  const todayKey = copenhagenDayKey();
  const isToday = dayKey === todayKey;

  const out: CopenhagenBookingSlotWithAvailability[] = [];

  for (let ms = start.getTime(); ms < dayEnd.getTime(); ms += 60 * 1000) {
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
    const dk = `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
    if (dk !== dayKey) continue;

    const h = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
    const m = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
    if (h < BOOKING_DAY_WINDOW.startH || h >= BOOKING_DAY_WINDOW.endH) continue;
    if (m % BOOKING_SLOT_STEP_MIN !== 0) continue;

    if (isToday && ms < now) continue;

    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const available = canBookMeetingAt(ms, meetingType, hardBlocks, softBlocks);
    out.push({ time, utcMs: ms, available });
  }
  return out;
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
  const { meeting, transports } = intervalsForMeeting(startMs, meetingType);
  for (const row of blockedRows) {
    const blockStart = new Date(row.startDateTime).getTime();
    const blockEnd = new Date(row.endDateTime).getTime();
    if (Number.isNaN(blockStart) || Number.isNaN(blockEnd) || blockEnd <= blockStart) continue;
    const block = { startMs: blockStart, endMs: blockEnd };
    if (blockOverlaps(meeting, block) || transports.some((t) => blockOverlaps(t, block))) {
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
