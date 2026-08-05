import { describe, expect, it } from "vitest";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  LEADERBOARD_CONTACT_BUCKET_MS,
  LEADERBOARD_MIN_CONVERSATION_SECONDS,
  LEADERBOARD_SAME_ATTEMPT_COLLAPSE_MS,
  collapseNearDuplicateAttempts,
  dialerTalkSeconds,
  effectiveUserIdForDialerLog,
  mergeConversationsWithOutcomeFallback,
  tallyContactsFromAttempts,
  tallyTelnyxLeaderboardMetrics,
  type ContactAttempt,
} from "./leaderboard-telnyx";

const lead = {
  lockedByUserId: "u_lock" as string | null,
  lockedAt: new Date("2026-05-01T10:00:00.000Z"),
  lockExpiresAt: new Date("2026-05-01T12:00:00.000Z"),
  assignedUserId: "u_asg" as string | null,
};

describe("effectiveUserIdForDialerLog", () => {
  it("bruger agentUserId først", () => {
    expect(
      effectiveUserIdForDialerLog({
        agentUserId: "agent1",
        leadId: "l1",
        startedAt: new Date("2026-05-01T10:30:00.000Z"),
        lead,
      }),
    ).toBe("agent1");
  });

  it("fallback til lås når startedAt er i vinduet", () => {
    expect(
      effectiveUserIdForDialerLog({
        agentUserId: null,
        leadId: "l1",
        startedAt: new Date("2026-05-01T10:30:00.000Z"),
        lead,
      }),
    ).toBe("u_lock");
  });

  it("fallback til assigned når uden for lås", () => {
    expect(
      effectiveUserIdForDialerLog({
        agentUserId: null,
        leadId: "l1",
        startedAt: new Date("2026-05-01T14:00:00.000Z"),
        lead,
      }),
    ).toBe("u_asg");
  });

  it("returnerer null uden leadId", () => {
    expect(
      effectiveUserIdForDialerLog({
        agentUserId: null,
        leadId: null,
        startedAt: new Date(),
        lead: null,
      }),
    ).toBeNull();
  });
});

describe("dialerTalkSeconds", () => {
  it("bruger bridgedAt når sat", () => {
    expect(
      dialerTalkSeconds({
        answeredAt: new Date("2026-05-01T10:00:00.000Z"),
        bridgedAt: new Date("2026-05-01T10:00:05.000Z"),
        endedAt: new Date("2026-05-01T10:00:30.000Z"),
      }),
    ).toBe(25);
  });

  it("bruger answeredAt uden bridge", () => {
    expect(
      dialerTalkSeconds({
        answeredAt: new Date("2026-05-01T10:00:00.000Z"),
        bridgedAt: null,
        endedAt: new Date("2026-05-01T10:00:25.000Z"),
      }),
    ).toBe(25);
  });

  it("null uden endedAt", () => {
    expect(
      dialerTalkSeconds({
        answeredAt: new Date(),
        bridgedAt: null,
        endedAt: null,
      }),
    ).toBeNull();
  });
});

describe("collapseNearDuplicateAttempts", () => {
  it("fjerner dubletter inden for collapse-vindue", () => {
    const t0 = new Date("2026-05-01T08:00:00.000Z");
    const attempts: ContactAttempt[] = [
      { userId: "u1", leadId: "l1", at: t0 },
      { userId: "u1", leadId: "l1", at: new Date(t0.getTime() + 30_000) },
      /** Stadig < collapse-vindue fra første *bevarede* (t0); mellemliggende rækker droppes. */
      { userId: "u1", leadId: "l1", at: new Date(t0.getTime() + 45_000) },
    ];
    const out = collapseNearDuplicateAttempts(attempts, LEADERBOARD_SAME_ATTEMPT_COLLAPSE_MS);
    expect(out).toHaveLength(1);
    expect(out[0]!.at.getTime()).toBe(t0.getTime());
  });
});

describe("tallyContactsFromAttempts (2h bucket)", () => {
  it("flere forsøg inden for 2 t tæller som 1 kontakt", () => {
    const t0 = new Date("2026-05-01T08:00:00.000Z");
    const attempts: ContactAttempt[] = [
      { userId: "u1", leadId: "l1", at: t0 },
      { userId: "u1", leadId: "l1", at: new Date(t0.getTime() + 60 * 60 * 1000) },
    ];
    const m = tallyContactsFromAttempts(attempts, LEADERBOARD_CONTACT_BUCKET_MS);
    expect(m.get("u1")).toBe(1);
  });

  it("forsøg efter 2 t giver ny kontakt", () => {
    const t0 = new Date("2026-05-01T08:00:00.000Z");
    const attempts: ContactAttempt[] = [
      { userId: "u1", leadId: "l1", at: t0 },
      { userId: "u1", leadId: "l1", at: new Date(t0.getTime() + LEADERBOARD_CONTACT_BUCKET_MS + 1) },
    ];
    const m = tallyContactsFromAttempts(attempts, LEADERBOARD_CONTACT_BUCKET_MS);
    expect(m.get("u1")).toBe(2);
  });
});

describe("tallyTelnyxLeaderboardMetrics", () => {
  const baseLead = {
    lockedByUserId: null as string | null,
    lockedAt: null as Date | null,
    lockExpiresAt: null as Date | null,
    assignedUserId: null as string | null,
  };

  it("tæller samtale ved taletid ≥ 20 s", () => {
    const { contacts, conversations } = tallyTelnyxLeaderboardMetrics(
      [
        {
          callControlId: "cc1",
          callSessionId: "sess1",
          direction: "outbound-lead",
          leadId: "l1",
          agentUserId: "u1",
          startedAt: new Date("2026-05-01T09:00:00.000Z"),
          answeredAt: new Date("2026-05-01T09:00:02.000Z"),
          bridgedAt: null,
          endedAt: new Date("2026-05-01T09:00:25.000Z"),
          lead: baseLead,
        },
      ],
      [],
    );
    expect(contacts.get("u1")).toBe(1);
    expect(conversations.get("u1")).toBe(1);
  });

  it("tæller ikke samtale under 20 s", () => {
    const { conversations } = tallyTelnyxLeaderboardMetrics(
      [
        {
          callControlId: "cc1",
          callSessionId: null,
          direction: "outbound-lead",
          leadId: "l1",
          agentUserId: "u1",
          startedAt: new Date("2026-05-01T09:00:00.000Z"),
          answeredAt: new Date("2026-05-01T09:00:02.000Z"),
          bridgedAt: null,
          endedAt: new Date("2026-05-01T09:00:15.000Z"),
          lead: baseLead,
        },
      ],
      [],
    );
    expect(conversations.get("u1")).toBeUndefined();
  });

  it("CALL_ATTEMPT med durationSeconds ≥ 20 tæller som samtale (WebRTC-taletid)", () => {
    const { contacts, conversations, conversationPairs } = tallyTelnyxLeaderboardMetrics(
      [],
      [
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          durationSeconds: LEADERBOARD_MIN_CONVERSATION_SECONDS,
        },
      ],
    );
    expect(contacts.get("u1")).toBe(1);
    expect(conversations.get("u1")).toBe(1);
    expect(conversationPairs.has("u1\0l1")).toBe(true);
  });

  it("CALL_ATTEMPT under 20 s eller uden duration tæller kun som kontakt", () => {
    const { contacts, conversations } = tallyTelnyxLeaderboardMetrics(
      [],
      [
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          durationSeconds: 5,
        },
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l2",
          createdAt: new Date("2026-05-01T11:00:00.000Z"),
          durationSeconds: null,
        },
      ],
    );
    expect(contacts.get("u1")).toBe(2);
    expect(conversations.get("u1")).toBeUndefined();
  });

  it("CALL_RECORDING tæller ikke som samtale længere", () => {
    const { conversations } = tallyTelnyxLeaderboardMetrics(
      [],
      [
        {
          kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          durationSeconds: 120,
        },
      ],
    );
    expect(conversations.get("u1")).toBeUndefined();
  });

  it("samme opkald fra både DialerCallLog og CALL_ATTEMPT foldes til én samtale", () => {
    const { conversations } = tallyTelnyxLeaderboardMetrics(
      [
        {
          callControlId: "cc1",
          callSessionId: "s1",
          direction: "outbound-lead",
          leadId: "l1",
          agentUserId: "u1",
          startedAt: new Date("2026-05-01T09:00:00.000Z"),
          answeredAt: new Date("2026-05-01T09:00:00.000Z"),
          bridgedAt: null,
          endedAt: new Date("2026-05-01T09:00:30.000Z"),
          lead: baseLead,
        },
      ],
      [
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T09:00:05.000Z"),
          durationSeconds: 30,
        },
      ],
    );
    expect(conversations.get("u1")).toBe(1);
  });

  it("to separate opkald ≥ 20 s på samme lead tæller som to samtaler", () => {
    const { conversations } = tallyTelnyxLeaderboardMetrics(
      [],
      [
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T09:00:00.000Z"),
          durationSeconds: 30,
        },
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T11:00:00.000Z"),
          durationSeconds: 45,
        },
      ],
    );
    expect(conversations.get("u1")).toBe(2);
  });
});

describe("talkSeconds i tallyTelnyxLeaderboardMetrics", () => {
  it("summerer taletid pr. bruger og tager max ved foldede dubletter", () => {
    const { talkSeconds, conversations } = tallyTelnyxLeaderboardMetrics(
      [],
      [
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T09:00:00.000Z"),
          durationSeconds: 30,
        },
        /** Dublet af samme opkald inden for 60 s — max(30, 45) tæller */
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T09:00:10.000Z"),
          durationSeconds: 45,
        },
        {
          kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
          userId: "u1",
          leadId: "l2",
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          durationSeconds: 60,
        },
      ],
    );
    expect(conversations.get("u1")).toBe(2);
    expect(talkSeconds.get("u1")).toBe(45 + 60);
  });
});

describe("mergeConversationsWithOutcomeFallback", () => {
  const talkTallies = (pairs: [string, string][], counts: [string, number][]) => ({
    contacts: new Map<string, number>(),
    conversations: new Map(counts),
    conversationPairs: new Set(pairs.map(([u, l]) => `${u}\0${l}`)),
    talkSeconds: new Map<string, number>(),
  });

  it("udfald med samtale tæller når leadet ikke har talk-samtale", () => {
    const merged = mergeConversationsWithOutcomeFallback(talkTallies([], []), [
      { userId: "u1", leadId: "l1", status: "MEETING_BOOKED" },
      { userId: "u1", leadId: "l2", status: "NOT_INTERESTED" },
      { userId: "u1", leadId: "l3", status: "VOICEMAIL" },
    ]);
    expect(merged.get("u1")).toBe(2);
  });

  it("springer udfald over for leads der allerede har talk-samtale (ingen dobbelttælling)", () => {
    const merged = mergeConversationsWithOutcomeFallback(
      talkTallies([["u1", "l1"]], [["u1", 1]]),
      [
        { userId: "u1", leadId: "l1", status: "MEETING_BOOKED" },
        { userId: "u1", leadId: "l2", status: "CALLBACK_SCHEDULED" },
      ],
    );
    expect(merged.get("u1")).toBe(2);
  });

  it("talk-samtale hos anden bruger blokerer ikke fallback", () => {
    const merged = mergeConversationsWithOutcomeFallback(
      talkTallies([["u2", "l1"]], [["u2", 1]]),
      [{ userId: "u1", leadId: "l1", status: "NOT_INTERESTED" }],
    );
    expect(merged.get("u1")).toBe(1);
    expect(merged.get("u2")).toBe(1);
  });
});
