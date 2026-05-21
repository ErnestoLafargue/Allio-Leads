import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import { isLeadInRebookingDialerPool } from "@/lib/lead-queue";
import { campaignIdForBookedMeetingOutcome } from "@/lib/meeting-campaign-routing";
import {
  MEETING_OUTCOME_CANCELLED,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";

export type AdminMeetingOutcomeRouting = {
  campaignIdToSet: string | null | undefined;
  statusOverride: string | undefined;
  logSentToRebooking: boolean;
};

/**
 * Kampagne/status ved admin-ændring af mødeudfald (uafhængigt af lead-status).
 */
export async function resolveAdminMeetingOutcomeRouting(
  outcomeRaw: string,
  sendToRebooking: boolean,
  currentStatus: string,
  currentMeetingOutcome: string,
  hasActiveBookedMeeting: boolean,
): Promise<AdminMeetingOutcomeRouting> {
  const o = normalizeMeetingOutcomeStatus(outcomeRaw);

  if (o === MEETING_OUTCOME_CANCELLED) {
    if (sendToRebooking) {
      const rebookingId = await ensureSystemCampaignId("rebooking");
      const inPool = isLeadInRebookingDialerPool({
        status: currentStatus,
        meetingOutcomeStatus: o,
      });
      return {
        campaignIdToSet: rebookingId,
        statusOverride: inPool ? undefined : "NEW",
        logSentToRebooking: true,
      };
    }
    return { campaignIdToSet: undefined, statusOverride: undefined, logSentToRebooking: false };
  }

  if (hasActiveBookedMeeting && currentStatus === "MEETING_BOOKED") {
    return {
      campaignIdToSet: await campaignIdForBookedMeetingOutcome(outcomeRaw),
      statusOverride: undefined,
      logSentToRebooking: false,
    };
  }

  return { campaignIdToSet: undefined, statusOverride: undefined, logSentToRebooking: false };
}
