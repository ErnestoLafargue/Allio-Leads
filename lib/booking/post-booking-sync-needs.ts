export type LeadPodioSyncSnapshot = {
  podioItemId: string | null;
  meetingScheduledFor: Date | null;
  meetingContactEmail: string;
  meetingContactName: string;
  meetingContactPhonePrivate: string;
  meetingCompanyName: string;
  calComBookingUid: string | null;
};

/** True når Podio/Cal-sync skal køres (spring over ved gentagen bekræft uden ændringer). */
export function leadNeedsPostBookingSync(
  before: LeadPodioSyncSnapshot,
  after: LeadPodioSyncSnapshot,
): boolean {
  if (!after.meetingScheduledFor || !after.meetingContactEmail.trim() || !after.meetingContactName.trim()) {
    return false;
  }
  if (!before.podioItemId) return true;
  if (!before.calComBookingUid) return true;
  if (before.meetingScheduledFor?.getTime() !== after.meetingScheduledFor?.getTime()) return true;
  if (before.meetingContactEmail.trim() !== after.meetingContactEmail.trim()) return true;
  if (before.meetingContactName.trim() !== after.meetingContactName.trim()) return true;
  if (before.meetingContactPhonePrivate.trim() !== after.meetingContactPhonePrivate.trim()) return true;
  if (before.meetingCompanyName.trim() !== after.meetingCompanyName.trim()) return true;
  return false;
}
