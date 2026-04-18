import { describe, expect, it } from "vitest";
import {
  leadStatusCountsForScoreboardContact,
  leaderboardDeltasForOutcome,
  normalizeLeaderboardOutcomeStatus,
  shouldLogOutcomeForLeaderboard,
} from "./lead-outcome-log";

describe("normalizeLeaderboardOutcomeStatus", () => {
  it("trimmer og kanoniserer kasse", () => {
    expect(normalizeLeaderboardOutcomeStatus("  not_interested  ")).toBe("NOT_INTERESTED");
    expect(normalizeLeaderboardOutcomeStatus("NOT-INTERESTED")).toBe("NOT_INTERESTED");
    expect(normalizeLeaderboardOutcomeStatus("not interested")).toBe("NOT_INTERESTED");
  });
});

describe("leaderboardDeltasForOutcome", () => {
  it("ikke interesseret tæller som samtale (kontakt tælles via historik på boardet)", () => {
    expect(leaderboardDeltasForOutcome("NOT_INTERESTED")).toEqual({
      meetings: 0,
      conversations: 1,
      contacts: 1,
    });
  });

  it("ukvalificeret tæller ikke som samtale", () => {
    expect(leaderboardDeltasForOutcome("UNQUALIFIED")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 0,
    });
  });

  it("fallback: små bogstaver og mellemrum for ikke interesseret", () => {
    expect(leaderboardDeltasForOutcome("not_interested")).toEqual(
      leaderboardDeltasForOutcome("NOT_INTERESTED"),
    );
  });

  it("ikke hjemme tæller ikke som samtale på scoreboard", () => {
    expect(leaderboardDeltasForOutcome("NOT_HOME")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 1,
    });
  });

  it("voicemail tæller ikke som samtale på scoreboard", () => {
    expect(leaderboardDeltasForOutcome("VOICEMAIL")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 1,
    });
    expect(leaderboardDeltasForOutcome("voice mail")).toEqual(
      leaderboardDeltasForOutcome("VOICEMAIL"),
    );
  });

  it("tilbagekald planlagt tæller ikke som samtale på scoreboard", () => {
    expect(leaderboardDeltasForOutcome("CALLBACK_SCHEDULED")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 1,
    });
  });

  it("møde booket tæller møde og samtale", () => {
    expect(leaderboardDeltasForOutcome("MEETING_BOOKED")).toEqual({
      meetings: 1,
      conversations: 1,
      contacts: 1,
    });
  });

  it("ukvalificeret tæller ikke på nogen kolonne", () => {
    expect(leaderboardDeltasForOutcome("UNQUALIIFIED")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 0,
    });
  });
});

describe("shouldLogOutcomeForLeaderboard", () => {
  it("genkender ikke interesseret med alternativ kasse", () => {
    expect(
      shouldLogOutcomeForLeaderboard(
        { status: "NEW", meetingBookedAt: null },
        "not_interested",
      ),
    ).toBe(true);
  });

  it("logger første callback-planlægning, ikke gentagelse", () => {
    expect(
      shouldLogOutcomeForLeaderboard({ status: "NEW", meetingBookedAt: null }, "CALLBACK_SCHEDULED"),
    ).toBe(true);
    expect(
      shouldLogOutcomeForLeaderboard(
        { status: "CALLBACK_SCHEDULED", meetingBookedAt: null },
        "CALLBACK_SCHEDULED",
      ),
    ).toBe(false);
  });
});

describe("leadStatusCountsForScoreboardContact", () => {
  it("kun ukvalificeret tæller ikke", () => {
    expect(leadStatusCountsForScoreboardContact("UNQUALIFIED")).toBe(false);
  });

  it("ny og øvrige udfald tæller", () => {
    expect(leadStatusCountsForScoreboardContact("NEW")).toBe(true);
    expect(leadStatusCountsForScoreboardContact("NOT_INTERESTED")).toBe(true);
    expect(leadStatusCountsForScoreboardContact("CALLBACK_SCHEDULED")).toBe(true);
    expect(leadStatusCountsForScoreboardContact("VOICEMAIL")).toBe(true);
  });
});
