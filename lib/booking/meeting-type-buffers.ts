import {
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
  normalizeMeetingType,
} from "@/lib/meeting-type";

/** Onlinemøde: 60 minutter, ingen transport. */
export const ONLINE_MEETING_DURATION_MIN = 60;
/** Fysisk møde: 90 minutter. */
export const PHYSICAL_MEETING_DURATION_MIN = 90;
/** Transportblokering før start og efter slut for fysisk møde. */
export const PHYSICAL_TRANSPORT_BUFFER_MIN = 60;

export function meetingDurationMinutes(type: MeetingType | string): number {
  return normalizeMeetingType(type) === MEETING_TYPE_PHYSICAL
    ? PHYSICAL_MEETING_DURATION_MIN
    : ONLINE_MEETING_DURATION_MIN;
}

/** Transportbuffer før start / efter slut (0 for online). */
export function transportBufferMinutes(type: MeetingType | string): number {
  return normalizeMeetingType(type) === MEETING_TYPE_PHYSICAL
    ? PHYSICAL_TRANSPORT_BUFFER_MIN
    : 0;
}

/**
 * Kompatibilitet: tidligere «mødeblok ±min» — returnerer nu transportbuffer
 * (0 online / 60 fysisk) så UI kan skelne.
 */
export function getMeetingBlockMinutesForType(type: MeetingType | string): number {
  return transportBufferMinutes(type);
}

/** Pad ved DB-forespørgsler: længste møde + transport. */
export function maxMeetingFootprintMinutes(): number {
  return PHYSICAL_MEETING_DURATION_MIN + PHYSICAL_TRANSPORT_BUFFER_MIN;
}
