import { isLeadStatus, type LeadStatus } from "@/lib/lead-status";

/**
 * Udfald der skriver ét LeadOutcomeLog ved gem (én række pr. reelt statusskifte).
 * Inkl. NEW og UNQUALIFIED. Scoreboard grupperer i «kontakt-episoder» adskilt af NEW (også system-logs ved auto-reset).
 */
export const LEADERBOARD_LOG_STATUSES = new Set<LeadStatus>([
  "NEW",
  "VOICEMAIL",
  "NOT_HOME",
  "NOT_INTERESTED",
  "UNQUALIFIED",
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
 * Scoreboard: kun seneste gemte udfald pr. lead pr. dag — disse tal pr. udfaldstype.
 * Invariant: kontakter ≥ samtaler for alle udfald.
 */
const LEADERBOARD_DELTAS: Partial<Record<LeadStatus, LeaderboardOutcomeDeltas>> = {
  NEW: { meetings: 0, conversations: 0, contacts: 0 },
  VOICEMAIL: { meetings: 0, conversations: 0, contacts: 1 },
  NOT_HOME: { meetings: 0, conversations: 0, contacts: 1 },
  NOT_INTERESTED: { meetings: 0, conversations: 1, contacts: 1 },
  UNQUALIFIED: { meetings: 0, conversations: 0, contacts: 0 },
  MEETING_BOOKED: { meetings: 1, conversations: 1, contacts: 1 },
  CALLBACK_SCHEDULED: { meetings: 0, conversations: 1, contacts: 1 },
};

/** Udvikling: opdag logikfejl (samtaler > kontakter m.m.). */
export function warnIfScoreboardUserTallyInconsistent(
  userId: string,
  meetings: number,
  conversations: number,
  contacts: number,
): void {
  if (process.env.NODE_ENV !== "development") return;
  if (conversations > contacts) {
    console.warn(
      `[scoreboard] Bruger ${userId}: samtaler (${conversations}) > kontakter (${contacts})`,
    );
  }
  if (meetings > conversations) {
    console.warn(
      `[scoreboard] Bruger ${userId}: møder (${meetings}) > samtaler (${conversations})`,
    );
  }
}

export function leaderboardDeltasForOutcome(status: string): LeaderboardOutcomeDeltas {
  const key = normalizeLeaderboardOutcomeStatus(status);
  if (!isLeadStatus(key)) {
    return { meetings: 0, conversations: 0, contacts: 0 };
  }
  return LEADERBOARD_DELTAS[key] ?? { meetings: 0, conversations: 0, contacts: 0 };
}

/** Til test: alle kendte udfald skal have kontakt ≥ samtale. */
export function scoreboardDeltaInvariantHolds(d: LeaderboardOutcomeDeltas): boolean {
  return d.contacts >= d.conversations && d.conversations >= d.meetings;
}

export type OutcomeLogRowForScoreboard = {
  leadId: string;
  userId: string | null;
  status: string;
  createdAt: Date;
};

/**
 * Scoreboard pr. valgt dag: summer én gang pr. kontakt-episode pr. lead.
 * Episoder adskilles af log med status NEW (bruger eller system). Inden for én episode tæller kun seneste bruger-udfald (ikke NEW).
 * Samme lead kan give flere episoder samme dag (fx voicemail → auto Ny → ikke interesseret).
 */
export function tallyScoreboardFromContactEpisodes(
  rows: OutcomeLogRowForScoreboard[],
): Map<string, LeaderboardOutcomeDeltas> {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const byLead = new Map<string, OutcomeLogRowForScoreboard[]>();
  for (const r of sorted) {
    const arr = byLead.get(r.leadId) ?? [];
    arr.push(r);
    byLead.set(r.leadId, arr);
  }

  const tallies = new Map<string, LeaderboardOutcomeDeltas>();
  function add(userId: string, d: LeaderboardOutcomeDeltas) {
    const p = tallies.get(userId) ?? { meetings: 0, conversations: 0, contacts: 0 };
    tallies.set(userId, {
      meetings: p.meetings + d.meetings,
      conversations: p.conversations + d.conversations,
      contacts: p.contacts + d.contacts,
    });
  }

  for (const [, logs] of byLead) {
    let segment: OutcomeLogRowForScoreboard[] = [];
    const flushSegment = () => {
      const scoring = segment.filter((r) => {
        if (!r.userId) return false;
        return normalizeLeaderboardOutcomeStatus(r.status) !== "NEW";
      });
      if (scoring.length > 0) {
        const last = scoring[scoring.length - 1]!;
        add(last.userId!, leaderboardDeltasForOutcome(last.status));
      }
      segment = [];
    };

    for (const r of logs) {
      if (normalizeLeaderboardOutcomeStatus(r.status) === "NEW") {
        flushSegment();
        continue;
      }
      segment.push(r);
    }
    flushSegment();
  }

  return tallies;
}

type ExistingForLog = {
  status: string;
  meetingBookedAt: Date | null;
};

/**
 * Undgå dobbelttælling i log-tabellen: kun ved reelt skifte til status (eller første møde / første callback-plan).
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
