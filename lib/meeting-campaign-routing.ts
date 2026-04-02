import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";
import { ensureStandardCampaignId, ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";

/**
 * Hvilken kampagne et «Møde booket»-lead skal ligge i ud fra mødeudfald.
 */
export async function campaignIdForBookedMeetingOutcome(outcomeRaw: string): Promise<string | null> {
  const o = normalizeMeetingOutcomeStatus(outcomeRaw);
  if (o === MEETING_OUTCOME_PENDING) {
    return ensureSystemCampaignId("upcoming_meetings");
  }
  if (o === MEETING_OUTCOME_CANCELLED) {
    return ensureSystemCampaignId("rebooking");
  }
  if (o === MEETING_OUTCOME_SALE) {
    return ensureSystemCampaignId("active_customers");
  }
  if (o === MEETING_OUTCOME_HELD) {
    return ensureStandardCampaignId();
  }
  return null;
}
