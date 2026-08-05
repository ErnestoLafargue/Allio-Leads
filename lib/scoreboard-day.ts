/**
 * Fælles beregning af dags-scoreboardet (pr. bruger + pr. kampagne) — bruges af
 * både /api/users/leaderboard (UI) og /api/export/plecto (Plecto-integration),
 * så begge altid viser samme tal.
 *
 * Kilder:
 *  - Kontakter/samtaler/taletid: DialerCallLog + CALL_ATTEMPT (se leaderboard-telnyx.ts)
 *  - Møder: LeadOutcomeLog-episoder (se lead-outcome-log.ts)
 *  - Login-/dialer-tid: UserPresenceDay + UserCampaignPresenceDay (heartbeats)
 */

import { prisma } from "@/lib/prisma";
import { copenhagenDayBoundsUtcFromDayKey } from "@/lib/copenhagen-day";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  scoringOutcomesFromContactEpisodes,
  tallyMeetingsFromOutcomeEpisodes,
  type OutcomeLogRowForScoreboard,
} from "@/lib/lead-outcome-log";
import {
  mergeConversationsWithOutcomeFallback,
  mergeScoringUserIds,
  tallyTelnyxLeaderboardMetrics,
  type ActivityRowForLeaderboard,
  type DialerRowForLeaderboard,
} from "@/lib/leaderboard-telnyx";
import { buildLeadCampaignAttribution } from "@/lib/lead-campaign-attribution";

export type ScoreboardCampaignSlice = {
  /** null = aktivitet på leads uden kampagne */
  campaignId: string | null;
  campaignName: string;
  meetings: number;
  conversations: number;
  contacts: number;
  /** Forbundet taletid i sekunder */
  talkSeconds: number;
  /** Tid på kampagnens arbejdsside (dialer åben) i sekunder */
  dialerSeconds: number;
  /** Gns. taletid pr. talk-baseret samtale, sekunder */
  avgConversationSeconds: number;
  /** Møder pr. samtale i procent */
  buyRatePct: number;
};

export type ScoreboardUserRow = {
  userId: string;
  name: string;
  username: string;
  role: string;
  meetings: number;
  conversations: number;
  contacts: number;
  talkSeconds: number;
  loginSeconds: number;
  dialerSeconds: number;
  avgConversationSeconds: number;
  buyRatePct: number;
  campaigns: ScoreboardCampaignSlice[];
};

export type ScoreboardDay = {
  dayKey: string;
  start: Date;
  end: Date;
  rows: ScoreboardUserRow[];
};

function avgSeconds(talkSeconds: number, talkConversations: number): number {
  return talkConversations > 0 ? Math.round(talkSeconds / talkConversations) : 0;
}

function buyRatePct(meetings: number, conversations: number): number {
  if (conversations <= 0) return 0;
  return Math.round((meetings / conversations) * 1000) / 10;
}

type OutcomeRowWithCampaign = OutcomeLogRowForScoreboard & {
  campaignId: string | null;
};
type ActivityRowWithCampaign = ActivityRowForLeaderboard & {
  campaignId: string | null;
};

/** Nøgle til Map hvor campaignId kan være null. */
const NO_CAMPAIGN = "\0none";
const keyOf = (campaignId: string | null) => campaignId ?? NO_CAMPAIGN;

export async function computeScoreboardForDay(dayKey: string): Promise<ScoreboardDay> {
  const { start, end } = copenhagenDayBoundsUtcFromDayKey(dayKey);

  const [logRowsRaw, dialerRows, activityRowsRaw, presenceRows, campaignPresenceRows] =
    await Promise.all([
      prisma.leadOutcomeLog.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: {
          leadId: true,
          userId: true,
          status: true,
          createdAt: true,
          lead: { select: { campaignId: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.dialerCallLog.findMany({
        where: {
          startedAt: { gte: start, lt: end },
          leadId: { not: null },
          direction: "outbound-lead",
        },
        select: {
          callControlId: true,
          callSessionId: true,
          direction: true,
          leadId: true,
          campaignId: true,
          agentUserId: true,
          startedAt: true,
          answeredAt: true,
          bridgedAt: true,
          endedAt: true,
          lead: {
            select: {
              lockedByUserId: true,
              lockedAt: true,
              lockExpiresAt: true,
              assignedUserId: true,
            },
          },
        },
      }),
      prisma.leadActivityEvent.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          userId: { not: null },
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
        },
        select: {
          kind: true,
          userId: true,
          leadId: true,
          createdAt: true,
          durationSeconds: true,
          lead: { select: { campaignId: true } },
        },
      }),
      prisma.userPresenceDay.findMany({
        where: { dayKey },
        select: { userId: true, loginSeconds: true },
      }),
      prisma.userCampaignPresenceDay.findMany({
        where: { dayKey },
        select: { userId: true, campaignId: true, dialerSeconds: true },
      }),
    ]);

  // Kampagne-attribution: leads flyttes til systemkampagnen «Kommende møder»
  // efter booking, så leadets aktuelle campaignId er misvisende. Vi bruger
  // kampagnen fra seneste kø-besøg før hændelsen; fallback = aktuel kampagne.
  const involvedLeadIds = [
    ...new Set([...logRowsRaw.map((r) => r.leadId), ...activityRowsRaw.map((r) => r.leadId)]),
  ];
  const visitRows = involvedLeadIds.length
    ? await prisma.leadVisitHistory.findMany({
        where: { leadId: { in: involvedLeadIds }, visitedAt: { lt: end } },
        select: { leadId: true, campaignId: true, visitedAt: true },
        orderBy: { visitedAt: "asc" },
      })
    : [];
  const attribution = buildLeadCampaignAttribution(visitRows);
  const campaignFor = (leadId: string, at: Date, currentCampaignId: string | null) =>
    attribution.campaignIdAt(leadId, at) ?? currentCampaignId;

  const logRows: OutcomeRowWithCampaign[] = logRowsRaw.map((r) => ({
    leadId: r.leadId,
    userId: r.userId,
    status: r.status,
    createdAt: r.createdAt,
    campaignId: campaignFor(r.leadId, r.createdAt, r.lead?.campaignId ?? null),
  }));
  const activityRows: ActivityRowWithCampaign[] = activityRowsRaw.map((r) => ({
    kind: r.kind,
    userId: r.userId,
    leadId: r.leadId,
    createdAt: r.createdAt,
    durationSeconds: r.durationSeconds,
    campaignId: campaignFor(r.leadId, r.createdAt, r.lead?.campaignId ?? null),
  }));

  // ---- Totaler pr. bruger (samme beregning som før, på hele dagens datasæt) ----
  const meetingTallies = tallyMeetingsFromOutcomeEpisodes(logRows);
  const telnyxTallies = tallyTelnyxLeaderboardMetrics(dialerRows, activityRows);
  const conversationTallies = mergeConversationsWithOutcomeFallback(
    telnyxTallies,
    scoringOutcomesFromContactEpisodes(logRows),
  );

  const loginSecondsByUser = new Map(presenceRows.map((p) => [p.userId, p.loginSeconds]));
  const dialerSecondsByUserCampaign = new Map<string, number>();
  const dialerSecondsByUser = new Map<string, number>();
  for (const p of campaignPresenceRows) {
    dialerSecondsByUserCampaign.set(`${p.userId}\0${p.campaignId}`, p.dialerSeconds);
    dialerSecondsByUser.set(
      p.userId,
      (dialerSecondsByUser.get(p.userId) ?? 0) + p.dialerSeconds,
    );
  }

  // ---- Pr. kampagne: kør samme tallies på kampagne-udsnit af dagens rækker ----
  const dialerByCampaign = new Map<string, DialerRowForLeaderboard[]>();
  for (const row of dialerRows) {
    const k = keyOf(row.campaignId);
    (dialerByCampaign.get(k) ?? dialerByCampaign.set(k, []).get(k)!).push(row);
  }
  const activityByCampaign = new Map<string, ActivityRowWithCampaign[]>();
  for (const row of activityRows) {
    const k = keyOf(row.campaignId);
    (activityByCampaign.get(k) ?? activityByCampaign.set(k, []).get(k)!).push(row);
  }
  const outcomeByCampaign = new Map<string, OutcomeRowWithCampaign[]>();
  for (const row of logRows) {
    const k = keyOf(row.campaignId);
    (outcomeByCampaign.get(k) ?? outcomeByCampaign.set(k, []).get(k)!).push(row);
  }

  const campaignKeys = new Set<string>([
    ...dialerByCampaign.keys(),
    ...activityByCampaign.keys(),
    ...outcomeByCampaign.keys(),
    ...campaignPresenceRows.map((p) => p.campaignId),
  ]);

  /** userId → campaignKey → slice (uden navn — navne sættes til sidst) */
  const slicesByUser = new Map<string, Map<string, ScoreboardCampaignSlice>>();
  const sliceFor = (userId: string, campaignKey: string): ScoreboardCampaignSlice => {
    const byCampaign = slicesByUser.get(userId) ?? new Map<string, ScoreboardCampaignSlice>();
    slicesByUser.set(userId, byCampaign);
    const existing = byCampaign.get(campaignKey);
    if (existing) return existing;
    const created: ScoreboardCampaignSlice = {
      campaignId: campaignKey === NO_CAMPAIGN ? null : campaignKey,
      campaignName: "",
      meetings: 0,
      conversations: 0,
      contacts: 0,
      talkSeconds: 0,
      dialerSeconds: 0,
      avgConversationSeconds: 0,
      buyRatePct: 0,
    };
    byCampaign.set(campaignKey, created);
    return created;
  };

  for (const key of campaignKeys) {
    const outcomes = outcomeByCampaign.get(key) ?? [];
    const cTelnyx = tallyTelnyxLeaderboardMetrics(
      dialerByCampaign.get(key) ?? [],
      activityByCampaign.get(key) ?? [],
    );
    const cMeetings = tallyMeetingsFromOutcomeEpisodes(outcomes);
    const cConversations = mergeConversationsWithOutcomeFallback(
      cTelnyx,
      scoringOutcomesFromContactEpisodes(outcomes),
    );

    const userIds = new Set<string>([
      ...cTelnyx.contacts.keys(),
      ...cConversations.keys(),
      ...cMeetings.keys(),
    ]);
    for (const uid of userIds) {
      const slice = sliceFor(uid, key);
      slice.meetings = cMeetings.get(uid) ?? 0;
      slice.conversations = cConversations.get(uid) ?? 0;
      slice.contacts = cTelnyx.contacts.get(uid) ?? 0;
      slice.talkSeconds = cTelnyx.talkSeconds.get(uid) ?? 0;
      slice.avgConversationSeconds = avgSeconds(
        slice.talkSeconds,
        cTelnyx.conversations.get(uid) ?? 0,
      );
      slice.buyRatePct = buyRatePct(slice.meetings, slice.conversations);
    }
  }

  // Dialer-tid pr. kampagne — også for kampagner uden anden aktivitet den dag.
  for (const p of campaignPresenceRows) {
    if (p.dialerSeconds <= 0) continue;
    const slice = sliceFor(p.userId, p.campaignId);
    slice.dialerSeconds = p.dialerSeconds;
  }

  // ---- Kampagnenavne ----
  const campaignIds = [...campaignKeys].filter((k) => k !== NO_CAMPAIGN);
  const campaigns = campaignIds.length
    ? await prisma.campaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, name: true },
      })
    : [];
  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));

  // ---- Hvem vises: brugere med login den dag + alle med scorende aktivitet ----
  const scoringUserIds = mergeScoringUserIds(
    telnyxTallies.contacts,
    conversationTallies,
    meetingTallies,
  );
  const presenceUserIds = [
    ...new Set([...loginSecondsByUser.keys(), ...dialerSecondsByUser.keys()]),
  ];

  const loginDayRows = await prisma.userLoginDay.findMany({
    where: { dayKey },
    select: { userId: true },
  });
  const visibleUserIds = new Set<string>([
    ...loginDayRows.map((r) => r.userId),
    ...scoringUserIds,
    ...presenceUserIds,
  ]);

  let users = await prisma.user.findMany({
    where: { id: { in: [...visibleUserIds] } },
    select: { id: true, name: true, username: true, role: true },
  });
  if (users.length === 0) {
    users = await prisma.user.findMany({
      where: { role: "SELLER" },
      select: { id: true, name: true, username: true, role: true },
      orderBy: { name: "asc" },
    });
  }

  const rows: ScoreboardUserRow[] = users
    .map((u) => {
      const meetings = meetingTallies.get(u.id) ?? 0;
      const conversations = conversationTallies.get(u.id) ?? 0;
      const contacts = telnyxTallies.contacts.get(u.id) ?? 0;
      const talkSeconds = telnyxTallies.talkSeconds.get(u.id) ?? 0;
      const campaignSlices = [...(slicesByUser.get(u.id)?.values() ?? [])]
        .map((s) => ({
          ...s,
          campaignName:
            s.campaignId === null
              ? "Uden kampagne"
              : campaignNameById.get(s.campaignId) ?? "Slettet kampagne",
        }))
        .sort((a, b) => {
          if (b.meetings !== a.meetings) return b.meetings - a.meetings;
          if (b.conversations !== a.conversations) return b.conversations - a.conversations;
          return b.contacts - a.contacts;
        });
      return {
        userId: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        meetings,
        conversations,
        contacts,
        talkSeconds,
        loginSeconds: loginSecondsByUser.get(u.id) ?? 0,
        dialerSeconds: dialerSecondsByUser.get(u.id) ?? 0,
        avgConversationSeconds: avgSeconds(
          talkSeconds,
          telnyxTallies.conversations.get(u.id) ?? 0,
        ),
        buyRatePct: buyRatePct(meetings, conversations),
        campaigns: campaignSlices,
      };
    })
    .sort((a, b) => {
      if (b.meetings !== a.meetings) return b.meetings - a.meetings;
      if (b.conversations !== a.conversations) return b.conversations - a.conversations;
      return b.contacts - a.contacts;
    });

  return { dayKey, start, end, rows };
}
