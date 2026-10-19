/**
 * Buffer / mødetype før/efter Native-bookingens start i Allio-Leads.
 * Spejler ONLINE/PHYSICAL-ydelser ud fra service_ids på bookingen.
 */
import {
  getMeetingBlockMinutesForType,
  meetingDurationMinutes,
  transportBufferMinutes,
} from "@/lib/booking/meeting-type-buffers";
import { serviceIdForMeetingType } from "@/lib/allio-native/client";
import {
  MEETING_TYPE_ONLINE,
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
} from "@/lib/meeting-type";

export function parseServiceIdsJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

export function serializeServiceIds(ids: string[] | null | undefined): string {
  return JSON.stringify(Array.isArray(ids) ? ids.filter(Boolean) : []);
}

/** Mødetype ud fra Native service_ids. */
export function meetingTypeForServiceIds(serviceIds: string[] | null | undefined): MeetingType {
  const ids = new Set((serviceIds ?? []).map((s) => s.trim()).filter(Boolean));
  const physicalId = serviceIdForMeetingType("PHYSICAL");
  const onlineId = serviceIdForMeetingType("ONLINE");
  if (physicalId && ids.has(physicalId)) return MEETING_TYPE_PHYSICAL;
  if (onlineId && ids.has(onlineId)) return MEETING_TYPE_ONLINE;
  return MEETING_TYPE_ONLINE;
}

/** @deprecated Brug meetingTypeForServiceIds + meetingDurationMinutes / transportBufferMinutes. */
export function bufferMinutesForServiceIds(serviceIds: string[] | null | undefined): number {
  return getMeetingBlockMinutesForType(meetingTypeForServiceIds(serviceIds));
}

export function durationMinutesForServiceIds(serviceIds: string[] | null | undefined): number {
  return meetingDurationMinutes(meetingTypeForServiceIds(serviceIds));
}

export function transportMinutesForServiceIds(serviceIds: string[] | null | undefined): number {
  return transportBufferMinutes(meetingTypeForServiceIds(serviceIds));
}
