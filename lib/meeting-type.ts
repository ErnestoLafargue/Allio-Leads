/** Mødetyper i Allio-Leads ↔ Allio-Native booking. */

export const MEETING_TYPE_ONLINE = "ONLINE" as const;
export const MEETING_TYPE_PHYSICAL = "PHYSICAL" as const;

export const MEETING_TYPES = [MEETING_TYPE_ONLINE, MEETING_TYPE_PHYSICAL] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

export function isMeetingType(value: unknown): value is MeetingType {
  return value === MEETING_TYPE_ONLINE || value === MEETING_TYPE_PHYSICAL;
}

export function normalizeMeetingType(value: unknown): MeetingType {
  if (isMeetingType(value)) return value;
  const s = String(value ?? "")
    .trim()
    .toUpperCase();
  if (s === MEETING_TYPE_PHYSICAL || s === "FYSISK") return MEETING_TYPE_PHYSICAL;
  return MEETING_TYPE_ONLINE;
}

export function meetingTypeLabel(type: MeetingType): string {
  return type === MEETING_TYPE_PHYSICAL ? "Fysisk møde" : "Onlinemøde";
}
