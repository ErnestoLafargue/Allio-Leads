import { describe, expect, it } from "vitest";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  LEADERBOARD_CONTACT_BUCKET_MS,
  LEADERBOARD_MIN_CONVERSATION_SECONDS,
  LEADERBOARD_SAME_ATTEMPT_COLLAPSE_MS,
  collapseNearDuplicateAttempts,
  dialerTalkSeconds,
  effectiveUserIdForDialerLog,
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
      { userId: "u1", leadId: "l1", at: new Date(t0.getTime() + 120_000) },
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

  it("CALL_RECORDING med varighed ≥ 20 s når log ikke har samme leg", () => {
    const { conversations } = tallyTelnyxLeaderboardMetrics(
      [],
      [
        {
          kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          durationSeconds: LEADERBOARD_MIN_CONVERSATION_SECONDS,
          telnyxCallLegId: "rec:abc",
        },
      ],
    );
    expect(conversations.get("u1")).toBe(1);
  });

  it("springer CALL_RECORDING over hvis call_control_id allerede talt fra log", () => {
    const { conversations } = tallyTelnyxLeaderboardMetrics(
      [
        {
          callControlId: "v3:same",
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
          kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
          userId: "u1",
          leadId: "l1",
          createdAt: new Date("2026-05-01T09:00:05.000Z"),
          durationSeconds: 30,
          telnyxCallLegId: "v3:same",
        },
      ],
    );
    expect(conversations.get("u1")).toBe(1);
  });
});
