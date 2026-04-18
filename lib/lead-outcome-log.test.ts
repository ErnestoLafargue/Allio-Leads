import { describe, expect, it } from "vitest";
import {
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
  it("ikke interesseret tæller som samtale og kontakt", () => {
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

  it("ikke hjemme tæller som samtale", () => {
    expect(leaderboardDeltasForOutcome("NOT_HOME")).toEqual({
      meetings: 0,
      conversations: 1,
      contacts: 1,
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
});
