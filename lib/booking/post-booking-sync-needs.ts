import {
  MEETING_TYPE_PHYSICAL,
  normalizeMeetingType,
} from "@/lib/meeting-type";

export type LeadPodioSyncSnapshot = {
  podioItemId: string | null;
  meetingScheduledFor: Date | null;
  meetingContactEmail: string;
  meetingContactName: string;
  meetingContactPhonePrivate: string;
  meetingCompanyName: string;
  calComBookingUid: string | null;
  allioBookingId?: string | null;
  meetingType?: string | null;
  meetingAddress?: string | null;
};

function allioNativeEnvConfigured(): boolean {
  return Boolean((process.env.ALLIO_API_KEY ?? "").trim());
}

/** True når Podio/Cal/Allio-Native-sync skal køres (spring over ved gentagen bekræft uden ændringer). */
export function leadNeedsPostBookingSync(
  before: LeadPodioSyncSnapshot,
  after: LeadPodioSyncSnapshot,
): boolean {
  if (!after.meetingScheduledFor || !after.meetingContactEmail.trim() || !after.meetingContactName.trim()) {
    return false;
  }
  const isPhysical = normalizeMeetingType(after.meetingType) === MEETING_TYPE_PHYSICAL;
  if (!before.podioItemId) return true;
  // Cal.eu kun for onlinemøder.
  if (!isPhysical && !before.calComBookingUid) return true;
  if (allioNativeEnvConfigured() && !before.allioBookingId) return true;
  if (before.meetingScheduledFor?.getTime() !== after.meetingScheduledFor?.getTime()) return true;
  if (before.meetingContactEmail.trim() !== after.meetingContactEmail.trim()) return true;
  if (before.meetingContactName.trim() !== after.meetingContactName.trim()) return true;
  if (before.meetingContactPhonePrivate.trim() !== after.meetingContactPhonePrivate.trim()) return true;
  if (before.meetingCompanyName.trim() !== after.meetingCompanyName.trim()) return true;
  if ((before.meetingType ?? "").trim() !== (after.meetingType ?? "").trim()) return true;
  if ((before.meetingAddress ?? "").trim() !== (after.meetingAddress ?? "").trim()) return true;
  return false;
}
