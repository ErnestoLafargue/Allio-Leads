import { copenhagenDayKey } from "@/lib/copenhagen-day";

export function resolveLeadCommissionDayKey(lead: {
  meetingCommissionDayKey?: string | null;
  meetingBookedAt?: Date | null;
}): string {
  const k = String(lead.meetingCommissionDayKey ?? "").trim();
  if (k) return k;
  if (lead.meetingBookedAt) return copenhagenDayKey(lead.meetingBookedAt);
  return "";
}
