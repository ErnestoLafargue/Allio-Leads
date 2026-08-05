/**
 * Scoreboard: kontakter og samtaler ud fra Telnyx/Neon (`DialerCallLog` + `LeadActivityEvent`).
 * Møder håndteres separat via udfalds-episoder i `lead-outcome-log.ts`.
 */

import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { leaderboardDeltasForOutcome, type ScoringOutcome } from "@/lib/lead-outcome-log";

/** To forsøg inden for dette vindue på samme bruger+lead foldes til ét inden 2-timers bucket. */
export const LEADERBOARD_SAME_ATTEMPT_COLLAPSE_MS = 60_000;

/** Én kontakt-bucket: alle forsøg inden for 2 t efter første forsøg i bucketen tæller som 1 kontakt. */
export const LEADERBOARD_CONTACT_BUCKET_MS = 2 * 60 * 60 * 1000;

export const LEADERBOARD_MIN_CONVERSATION_SECONDS = 20;

export type LeadLockFields = {
  lockedByUserId: string | null;
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
  assignedUserId: string | null;
};

/**
 * 1) agentUserId 2) lockedByUserId hvis startedAt i låsevinduet 3) assignedUserId
 */
export function effectiveUserIdForDialerLog(params: {
  agentUserId: string | null;
  leadId: string | null;
  startedAt: Date;
  lead: LeadLockFields | null;
}): string | null {
  if (!params.leadId) return null;
  if (params.agentUserId) return params.agentUserId;
  const l = params.lead;
  if (!l) return null;
  if (
    l.lockedByUserId &&
    l.lockedAt &&
    l.lockExpiresAt &&
    params.startedAt >= l.lockedAt &&
    params.startedAt < l.lockExpiresAt
  ) {
    return l.lockedByUserId;
  }
  return l.assignedUserId;
}

/** Taletid i sekunder: fra bridge (eller første svar) til hangup. */
export function dialerTalkSeconds(log: {
  answeredAt: Date | null;
  bridgedAt: Date | null;
  endedAt: Date | null;
}): number | null {
  if (!log.endedAt) return null;
  const talkStart = log.bridgedAt ?? log.answeredAt;
  if (!talkStart) return null;
  return (log.endedAt.getTime() - talkStart.getTime()) / 1000;
}

export type ContactAttempt = {
  userId: string;
  leadId: string;
  at: Date;
};

/**
 * Sortert, fold sammen forsøg inden for `collapseMs` (samme userId+leadId).
 */
export function collapseNearDuplicateAttempts(
  attempts: ContactAttempt[],
  collapseMs: number,
): ContactAttempt[] {
  const sorted = [...attempts].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.leadId.localeCompare(b.leadId),
  );
  const out: ContactAttempt[] = [];
  for (const a of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.userId === a.userId &&
      prev.leadId === a.leadId &&
      a.at.getTime() - prev.at.getTime() < collapseMs
    ) {
      continue;
    }
    out.push(a);
  }
  return out;
}

/**
 * Antal kontakter pr. bruger: for hvert (userId, leadId) grupperes tidsstempler i buckets;
 * første tid t0 åbner en bucket; alle tider med t <= t0 + bucketMs hører med; næste tid > t0 + bucketMs åbner ny bucket.
 */
export function tallyContactsFromAttempts(
  attempts: ContactAttempt[],
  bucketMs: number,
): Map<string, number> {
  const byPair = new Map<string, number[]>();
  for (const a of attempts) {
    const key = `${a.userId}\0${a.leadId}`;
    const arr = byPair.get(key) ?? [];
    arr.push(a.at.getTime());
    byPair.set(key, arr);
  }
  const counts = new Map<string, number>();
  for (const [pairKey, timeMs] of byPair) {
    const userId = pairKey.split("\0")[0]!;
    timeMs.sort((x, y) => x - y);
    let buckets = 0;
    let i = 0;
    while (i < timeMs.length) {
      buckets += 1;
      const t0 = timeMs[i]!;
      i++;
      while (i < timeMs.length && timeMs[i]! <= t0 + bucketMs) {
        i++;
      }
    }
    counts.set(userId, (counts.get(userId) ?? 0) + buckets);
  }
  return counts;
}

export type DialerRowForLeaderboard = {
  callControlId: string;
  callSessionId: string | null;
  direction: string;
  leadId: string | null;
  agentUserId: string | null;
  startedAt: Date;
  answeredAt: Date | null;
  bridgedAt: Date | null;
  endedAt: Date | null;
  lead: LeadLockFields | null;
};

export type ActivityRowForLeaderboard = {
  kind: string;
  userId: string | null;
  leadId: string;
  createdAt: Date;
  durationSeconds: number | null;
};

export type TelnyxLeaderboardTallies = {
  contacts: Map<string, number>;
  conversations: Map<string, number>;
  /** `${userId}\0${leadId}` for par med mindst én talk-baseret samtale — bruges til udfalds-fallback-dedup. */
  conversationPairs: Set<string>;
  /** Samlet forbundet taletid (sekunder) pr. bruger over talk-baserede samtaler. */
  talkSeconds: Map<string, number>;
};

/**
 * Saml kontakter (collapsed + 2h buckets) og samtaler (forbundet tale ≥ 20 s).
 * Samtaler kommer fra `DialerCallLog`-taletid og fra `CALL_ATTEMPT.durationSeconds`
 * (rapporteret af WebRTC-klienten) — IKKE fra lydoptagelser, som ikke altid
 * synkroniseres fra Telnyx. Samme opkald set fra begge kilder foldes sammen
 * via 60s-collapse pr. bruger+lead.
 */
export function tallyTelnyxLeaderboardMetrics(
  dialerRows: DialerRowForLeaderboard[],
  activityRows: ActivityRowForLeaderboard[],
): TelnyxLeaderboardTallies {
  const contactAttempts: ContactAttempt[] = [];
  type ConversationEvent = ContactAttempt & { seconds: number };
  const conversationEvents: ConversationEvent[] = [];

  /** Én samtale pr. bruger pr. session/control fra DialerCallLog */
  const logConversationCounted = new Set<string>();

  for (const row of dialerRows) {
    if (row.direction !== "outbound-lead" || !row.leadId) continue;
    const uid = effectiveUserIdForDialerLog({
      agentUserId: row.agentUserId,
      leadId: row.leadId,
      startedAt: row.startedAt,
      lead: row.lead,
    });
    if (!uid) continue;

    contactAttempts.push({ userId: uid, leadId: row.leadId, at: row.startedAt });

    const sec = dialerTalkSeconds(row);
    if (sec !== null && sec >= LEADERBOARD_MIN_CONVERSATION_SECONDS) {
      const dedup = row.callSessionId?.trim() || row.callControlId;
      const pairKey = `${uid}\0${dedup}`;
      if (logConversationCounted.has(pairKey)) continue;
      logConversationCounted.add(pairKey);
      conversationEvents.push({
        userId: uid,
        leadId: row.leadId,
        at: row.startedAt,
        seconds: Math.round(sec),
      });
    }
  }

  for (const ev of activityRows) {
    if (ev.kind !== LEAD_ACTIVITY_KIND.CALL_ATTEMPT || !ev.userId) continue;
    contactAttempts.push({ userId: ev.userId, leadId: ev.leadId, at: ev.createdAt });
    if (
      typeof ev.durationSeconds === "number" &&
      ev.durationSeconds >= LEADERBOARD_MIN_CONVERSATION_SECONDS
    ) {
      conversationEvents.push({
        userId: ev.userId,
        leadId: ev.leadId,
        at: ev.createdAt,
        seconds: ev.durationSeconds,
      });
    }
  }

  const collapsed = collapseNearDuplicateAttempts(
    contactAttempts,
    LEADERBOARD_SAME_ATTEMPT_COLLAPSE_MS,
  );
  const contacts = tallyContactsFromAttempts(collapsed, LEADERBOARD_CONTACT_BUCKET_MS);

  // Samme opkald kan optræde både som DialerCallLog og CALL_ATTEMPT — fold
  // samtale-events inden for 60 s pr. bruger+lead til én samtale. Taletiden
  // for en foldet gruppe er den længste rapporterede (samme opkald, to kilder).
  const sortedConversations = [...conversationEvents].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.leadId.localeCompare(b.leadId),
  );
  const collapsedConversations: ConversationEvent[] = [];
  for (const c of sortedConversations) {
    const prev = collapsedConversations[collapsedConversations.length - 1];
    if (
      prev &&
      prev.userId === c.userId &&
      prev.leadId === c.leadId &&
      c.at.getTime() - prev.at.getTime() < LEADERBOARD_SAME_ATTEMPT_COLLAPSE_MS
    ) {
      prev.seconds = Math.max(prev.seconds, c.seconds);
      continue;
    }
    collapsedConversations.push({ ...c });
  }

  const conversations = new Map<string, number>();
  const conversationPairs = new Set<string>();
  const talkSeconds = new Map<string, number>();
  for (const c of collapsedConversations) {
    conversations.set(c.userId, (conversations.get(c.userId) ?? 0) + 1);
    conversationPairs.add(`${c.userId}\0${c.leadId}`);
    talkSeconds.set(c.userId, (talkSeconds.get(c.userId) ?? 0) + c.seconds);
  }

  return { contacts, conversations, conversationPairs, talkSeconds };
}

/**
 * Samtaler til scoreboardet: talk-baserede (≥ 20 s forbundet tale) plus fallback
 * fra udfald der indebærer en samtale (møde booket, ikke interesseret, callback).
 * Fallback gælder kun leads hvor brugeren IKKE har en talk-baseret samtale samme
 * dag — så historiske dage uden gemt taletid ikke står med 0 samtaler, og nye
 * dage ikke dobbelttæller.
 */
export function mergeConversationsWithOutcomeFallback(
  telnyx: TelnyxLeaderboardTallies,
  scoringOutcomes: ScoringOutcome[],
): Map<string, number> {
  const merged = new Map(telnyx.conversations);
  for (const s of scoringOutcomes) {
    const d = leaderboardDeltasForOutcome(s.status);
    if (d.conversations <= 0) continue;
    if (telnyx.conversationPairs.has(`${s.userId}\0${s.leadId}`)) continue;
    merged.set(s.userId, (merged.get(s.userId) ?? 0) + d.conversations);
  }
  return merged;
}

export function mergeScoringUserIds(...maps: Map<string, number>[]): string[] {
  const ids = new Set<string>();
  for (const m of maps) {
    for (const [k, v] of m) {
      if (v > 0) ids.add(k);
    }
  }
  return [...ids];
}
