import { isLeadStatus, type LeadStatus } from "@/lib/lead-status";

/** Udfald der tæller på daglig leaderboard (ét log pr. reel handling). */
export const LEADERBOARD_LOG_STATUSES = new Set<LeadStatus>([
  "VOICEMAIL",
  "NOT_HOME",
  "NOT_INTERESTED",
  "MEETING_BOOKED",
]);

export type LeaderboardOutcomeDeltas = {
  meetings: number;
  conversations: number;
  contacts: number;
};

/**
 * Per registreret udfald: voicemail = 1 kontakt; ikke interesseret/ikke hjemme = 1 samtale + 1 kontakt;
 * møde booket = 1 møde + 1 samtale + 1 kontakt.
 */
export function leaderboardDeltasForOutcome(status: string): LeaderboardOutcomeDeltas {
  switch (status) {
    case "VOICEMAIL":
      return { meetings: 0, conversations: 0, contacts: 1 };
    case "NOT_HOME":
    case "NOT_INTERESTED":
      return { meetings: 0, conversations: 1, contacts: 1 };
    case "MEETING_BOOKED":
      return { meetings: 1, conversations: 1, contacts: 1 };
    default:
      return { meetings: 0, conversations: 0, contacts: 0 };
  }
}

type ExistingForLog = {
  status: string;
  meetingBookedAt: Date | null;
};

/**
 * Undgå dobbelttælling: kun når status faktisk skifter til udfaldet, eller første mødebookning.
 */
export function shouldLogOutcomeForLeaderboard(existing: ExistingForLog, newStatus: string): boolean {
  if (!isLeadStatus(newStatus) || !LEADERBOARD_LOG_STATUSES.has(newStatus)) return false;
  if (newStatus === "MEETING_BOOKED") {
    return existing.status !== "MEETING_BOOKED" || !existing.meetingBookedAt;
  }
  return existing.status !== newStatus;
}
