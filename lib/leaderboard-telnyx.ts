/**
 * Scoreboard: kontakter og samtaler ud fra Telnyx/Neon (`DialerCallLog` + `LeadActivityEvent`).
 * Møder håndteres separat via udfalds-episoder i `lead-outcome-log.ts`.
 */

import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

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
  telnyxCallLegId: string | null;
};

export type TelnyxLeaderboardTallies = {
  contacts: Map<string, number>;
  conversations: Map<string, number>;
};

/**
 * Saml kontakter (collapsed + 2h buckets) og samtaler (≥20s på outbound-lead + CALL_RECORDING).
 */
export function tallyTelnyxLeaderboardMetrics(
  dialerRows: DialerRowForLeaderboard[],
  activityRows: ActivityRowForLeaderboard[],
): TelnyxLeaderboardTallies {
  const contactAttempts: ContactAttempt[] = [];

  /** call_control_id / call_session_id — optagelse må ikke dobbelttælle samme opkald */
  const consumedConversationIds = new Set<string>();
  /** Én samtale pr. bruger pr. session/control fra DialerCallLog */
  const logConversationCounted = new Set<string>();
  const conversationUserCounts = new Map<string, number>();

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
      consumedConversationIds.add(row.callControlId);
      const sid = row.callSessionId?.trim();
      if (sid) consumedConversationIds.add(sid);
      conversationUserCounts.set(uid, (conversationUserCounts.get(uid) ?? 0) + 1);
    }
  }

  for (const ev of activityRows) {
    if (ev.kind === LEAD_ACTIVITY_KIND.CALL_ATTEMPT && ev.userId) {
      contactAttempts.push({ userId: ev.userId, leadId: ev.leadId, at: ev.createdAt });
    }
  }

  const collapsed = collapseNearDuplicateAttempts(
    contactAttempts,
    LEADERBOARD_SAME_ATTEMPT_COLLAPSE_MS,
  );
  const contacts = tallyContactsFromAttempts(collapsed, LEADERBOARD_CONTACT_BUCKET_MS);

  for (const ev of activityRows) {
    if (ev.kind !== LEAD_ACTIVITY_KIND.CALL_RECORDING || !ev.userId) continue;
    const dur = ev.durationSeconds;
    if (typeof dur !== "number" || dur < LEADERBOARD_MIN_CONVERSATION_SECONDS) continue;
    const leg = ev.telnyxCallLegId?.trim();
    if (leg && consumedConversationIds.has(leg)) continue;
    conversationUserCounts.set(ev.userId, (conversationUserCounts.get(ev.userId) ?? 0) + 1);
  }

  return { contacts, conversations: conversationUserCounts };
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
