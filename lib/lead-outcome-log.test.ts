import { describe, expect, it } from "vitest";
import { LEAD_STATUSES } from "@/lib/lead-status";
import {
  leaderboardDeltasForOutcome,
  normalizeLeaderboardOutcomeStatus,
  scoreboardDeltaInvariantHolds,
  shouldLogOutcomeForLeaderboard,
} from "./lead-outcome-log";

describe("normalizeLeaderboardOutcomeStatus", () => {
  it("trimmer og kanoniserer kasse", () => {
    expect(normalizeLeaderboardOutcomeStatus("  not_interested  ")).toBe("NOT_INTERESTED");
    expect(normalizeLeaderboardOutcomeStatus("NOT-INTERESTED")).toBe("NOT_INTERESTED");
    expect(normalizeLeaderboardOutcomeStatus("not interested")).toBe("NOT_INTERESTED");
  });
});

describe("leaderboardDeltasForOutcome (scoreboard-udfald)", () => {
  it("ny: 0 på alt", () => {
    expect(leaderboardDeltasForOutcome("NEW")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 0,
    });
  });

  it("voicemail / ikke hjemme: kun kontakt", () => {
    expect(leaderboardDeltasForOutcome("VOICEMAIL")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 1,
    });
    expect(leaderboardDeltasForOutcome("NOT_HOME")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 1,
    });
  });

  it("ikke interesseret / tilbagekald: samtale + kontakt", () => {
    expect(leaderboardDeltasForOutcome("NOT_INTERESTED")).toEqual({
      meetings: 0,
      conversations: 1,
      contacts: 1,
    });
    expect(leaderboardDeltasForOutcome("CALLBACK_SCHEDULED")).toEqual({
      meetings: 0,
      conversations: 1,
      contacts: 1,
    });
  });

  it("ukvalificeret: 0", () => {
    expect(leaderboardDeltasForOutcome("UNQUALIFIED")).toEqual({
      meetings: 0,
      conversations: 0,
      contacts: 0,
    });
  });

  it("møde booket: møde + samtale + kontakt", () => {
    expect(leaderboardDeltasForOutcome("MEETING_BOOKED")).toEqual({
      meetings: 1,
      conversations: 1,
      contacts: 1,
    });
  });

  it("alle kendte udfald: kontakt ≥ samtale ≥ møde", () => {
    for (const st of LEAD_STATUSES) {
      const d = leaderboardDeltasForOutcome(st);
      expect(scoreboardDeltaInvariantHolds(d), st).toBe(true);
    }
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

  it("logger skifte til ny (scoreboard-seneste udfald)", () => {
    expect(
      shouldLogOutcomeForLeaderboard({ status: "VOICEMAIL", meetingBookedAt: null }, "NEW"),
    ).toBe(true);
    expect(shouldLogOutcomeForLeaderboard({ status: "NEW", meetingBookedAt: null }, "NEW")).toBe(
      false,
    );
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
