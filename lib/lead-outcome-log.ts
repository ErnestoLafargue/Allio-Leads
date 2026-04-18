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
 * Kanoniserer status fra DB / ældre logs (mellemrum, bindestreg, kasse).
 * Bruges på scoreboard og ved oprettelse af log, så «ikke interesseret» altid tæller som samtale.
 */
export function normalizeLeaderboardOutcomeStatus(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  s = s.replace(/-/g, "_").replace(/\s+/g, "_").toUpperCase();
  if (s === "NOTINTERESTED") return "NOT_INTERESTED";
  if (s === "NOTHOME") return "NOT_HOME";
  if (s === "MEETINGBOOKED") return "MEETING_BOOKED";
  return s;
}

/**
 * Per registreret udfald på scoreboard:
 * - Voicemail = 1 kontakt (ikke samtale).
 * - Ikke hjemme / ikke interesseret = 1 samtale + 1 kontakt.
 * - Ukvalificeret = ingen samtale (og ingen kontakt her — logges normalt ikke).
 * - Møde booket = 1 møde + 1 samtale + 1 kontakt.
 */
export function leaderboardDeltasForOutcome(status: string): LeaderboardOutcomeDeltas {
  const key = normalizeLeaderboardOutcomeStatus(status);
  switch (key) {
    case "VOICEMAIL":
      return { meetings: 0, conversations: 0, contacts: 1 };
    case "NOT_HOME":
      return { meetings: 0, conversations: 1, contacts: 1 };
    case "NOT_INTERESTED":
      return { meetings: 0, conversations: 1, contacts: 1 };
    case "UNQUALIFIED":
      return { meetings: 0, conversations: 0, contacts: 0 };
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
  const normalized = normalizeLeaderboardOutcomeStatus(newStatus);
  if (!isLeadStatus(normalized) || !LEADERBOARD_LOG_STATUSES.has(normalized)) return false;
  const prev = normalizeLeaderboardOutcomeStatus(existing.status);
  if (normalized === "MEETING_BOOKED") {
    return prev !== "MEETING_BOOKED" || !existing.meetingBookedAt;
  }
  return prev !== normalized;
}
