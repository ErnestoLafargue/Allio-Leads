import { copenhagenDayBoundsUtcFromDayKey, copenhagenDayKey } from "@/lib/copenhagen-day";
import {
  MEETING_OUTCOME_PENDING,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";

/** 15-minutters gitter som i kalenderen */
export const BOOKING_SLOT_STEP_MIN = 15;
/** Hvert booket møde reserverer et vindue på denne længde */
export const BOOKING_MEETING_BLOCK_MIN = 75;

/** Samme arbejdsvindue: 09:00–17:00 (17 ekskl.) */
export const BOOKING_DAY_WINDOW = { startH: 9, endH: 17 } as const;

export type TimeBlockMs = { startMs: number; endMs: number };

export type CopenhagenBookingSlot = { time: string; utcMs: number };

export function getMeetingBlockEndMs(startMs: number): number {
  return startMs + BOOKING_MEETING_BLOCK_MIN * 60 * 1000;
}

/** Åbne intervaller [aStart,aEnd) og [bStart,bEnd) */
export function intervalsOverlapExclusiveEnd(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function isSlotStartBlocked(
  slotStartMs: number,
  slotDurationMin: number,
  occupied: TimeBlockMs[],
): boolean {
  const slotEndMs = slotStartMs + slotDurationMin * 60 * 1000;
  for (const o of occupied) {
    if (intervalsOverlapExclusiveEnd(slotStartMs, slotEndMs, o.startMs, o.endMs)) {
      return true;
    }
  }
  return false;
}

export function occupiedBlocksFromScheduledMeetings(
  rows: {
    meetingScheduledFor: Date | null;
    meetingOutcomeStatus?: string | null;
  }[],
): TimeBlockMs[] {
  const out: TimeBlockMs[] = [];
  for (const row of rows) {
    if (!row.meetingScheduledFor) continue;
    /** Kun afventende møder reserverer kalenderslots. */
    if (normalizeMeetingOutcomeStatus(row.meetingOutcomeStatus) !== MEETING_OUTCOME_PENDING) {
      continue;
    }
    const startMs = row.meetingScheduledFor.getTime();
    if (Number.isNaN(startMs)) continue;
    out.push({ startMs, endMs: getMeetingBlockEndMs(startMs) });
  }
  return out;
}

export function isPastCopenhagenDayKey(dayKey: string): boolean {
  const today = copenhagenDayKey();
  return dayKey < today;
}

/**
 * Ledige 15-min starttider på en kalenderdag i Europe/Copenhagen, efter 75-min blokke.
 */
export function getAvailableCopenhagenBookingSlots(
  dayKey: string,
  occupied: TimeBlockMs[],
): CopenhagenBookingSlot[] {
  if (isPastCopenhagenDayKey(dayKey)) return [];

  const { start } = copenhagenDayBoundsUtcFromDayKey(dayKey);
  const dayEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const now = Date.now();
  const todayKey = copenhagenDayKey();
  const isToday = dayKey === todayKey;

  const out: CopenhagenBookingSlot[] = [];

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

    if (!isSlotStartBlocked(ms, BOOKING_SLOT_STEP_MIN, occupied)) {
      out.push({
        time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        utcMs: ms,
      });
    }
  }
  return out;
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

export function findBookingTimeConflict(
  proposedStart: Date,
  existingRows: { id: string; meetingScheduledFor: Date | null; meetingOutcomeStatus: string | null }[],
  opts?: { blockMinutes?: number },
): { id: string } | null {
  const blockMin = opts?.blockMinutes ?? BOOKING_MEETING_BLOCK_MIN;
  const startMs = proposedStart.getTime();
  const endMs = startMs + blockMin * 60 * 1000;
  if (Number.isNaN(startMs)) return null;

  for (const row of existingRows) {
    if (!row.meetingScheduledFor) continue;
    if (normalizeMeetingOutcomeStatus(row.meetingOutcomeStatus) !== MEETING_OUTCOME_PENDING) {
      continue;
    }
    const os = row.meetingScheduledFor.getTime();
    const oe = os + blockMin * 60 * 1000;
    if (intervalsOverlapExclusiveEnd(startMs, endMs, os, oe)) {
      return { id: row.id };
    }
  }
  return null;
}
