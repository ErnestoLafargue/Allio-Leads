import { isLeadStatus, type LeadStatus } from "@/lib/lead-status";

/**
 * Udfald der skriver ét LeadOutcomeLog (én tællende handling pr. statusskifte / første møde).
 * Ukvalificeret er bevidst udeladt: det tæller ikke på scoreboard (ingen kontakt/samtale/møde).
 */
export const LEADERBOARD_LOG_STATUSES = new Set<LeadStatus>([
  "VOICEMAIL",
  "NOT_HOME",
  "NOT_INTERESTED",
  "MEETING_BOOKED",
  "CALLBACK_SCHEDULED",
]);

export type LeaderboardOutcomeDeltas = {
  meetings: number;
  conversations: number;
  contacts: number;
};

/**
 * Kanoniserer status fra DB / ældre logs (mellemrum, bindestreg, kasse).
 * Bruges på scoreboard og ved oprettelse af log (samtale-kolonnen: kun ikke interesseret + møde booket).
 */
export function normalizeLeaderboardOutcomeStatus(raw: string): string {
  let s = String(raw ?? "")
    .trim()
    .replace(/^\uFEFF/, "");
  if (!s) return "";
  s = s.replace(/-/g, "_").replace(/\s+/g, "_").toUpperCase();
  if (s === "NOTINTERESTED") return "NOT_INTERESTED";
  if (s === "NOTHOME") return "NOT_HOME";
  if (s === "MEETINGBOOKED") return "MEETING_BOOKED";
  if (s === "VOICE_MAIL") return "VOICEMAIL";
  if (s === "UNQUALIIFIED") return "UNQUALIFIED";
  if (s === "CALLBACK" || s === "CALLBACKPLANLAGT" || s === "CALLBACK_PLANLAGT") {
    return "CALLBACK_SCHEDULED";
  }
  return s;
}

/**
 * Scoreboard: samtaler tælles kun for «Ikke interesseret» og «Møde booket» (per LeadOutcomeLog).
 * Kontakter kommer fra besøgshistorik — se leadStatusCountsForScoreboardContact.
 */
const LEADERBOARD_DELTAS: Partial<Record<LeadStatus, LeaderboardOutcomeDeltas>> = {
  VOICEMAIL: { meetings: 0, conversations: 0, contacts: 1 },
  NOT_HOME: { meetings: 0, conversations: 0, contacts: 1 },
  NOT_INTERESTED: { meetings: 0, conversations: 1, contacts: 1 },
  MEETING_BOOKED: { meetings: 1, conversations: 1, contacts: 1 },
  CALLBACK_SCHEDULED: { meetings: 0, conversations: 0, contacts: 1 },
  UNQUALIFIED: { meetings: 0, conversations: 0, contacts: 0 },
};

/**
 * Per LeadOutcomeLog-række: møder og samtaler (kontakter på boardet tælles kun via besøg — contacts-felt bruges ikke i leaderboard).
 */
export function leaderboardDeltasForOutcome(status: string): LeaderboardOutcomeDeltas {
  const key = normalizeLeaderboardOutcomeStatus(status);
  if (!isLeadStatus(key)) {
    return { meetings: 0, conversations: 0, contacts: 0 };
  }
  return LEADERBOARD_DELTAS[key] ?? { meetings: 0, conversations: 0, contacts: 0 };
}

/**
 * Om leadets udfald (typisk aktuel status fra DB) skal tælle som én kontakt for et besøg på scoreboard.
 * Kun ukvalificeret tæller ikke; alle andre kendte udfald (inkl. Ny) tæller.
 */
export function leadStatusCountsForScoreboardContact(statusRaw: string | null | undefined): boolean {
  const key = normalizeLeaderboardOutcomeStatus(String(statusRaw ?? ""));
  if (!key || !isLeadStatus(key)) return false;
  return key !== "UNQUALIFIED";
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
  if (normalized === "CALLBACK_SCHEDULED") {
    return prev !== "CALLBACK_SCHEDULED";
  }
  return prev !== normalized;
}
