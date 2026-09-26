import { describe, expect, it } from "vitest";
import {
  compareLeadQueueOrder,
  isLeadInRebookingDialerPool,
  isQueueEligibleStatus,
  sortLeadsForCampaignCallQueue,
} from "./lead-queue";

describe("compareLeadQueueOrder", () => {
  it("sorterer færrest unansweredAttempts først", () => {
    const zero = {
      status: "NEW",
      id: "a",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
      lastOutcomeAt: "2025-06-01T08:00:00.000Z",
    };
    const one = {
      status: "NEW",
      id: "b",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 1,
      lastOutcomeAt: "2025-01-01T08:00:00.000Z",
    };
    expect(compareLeadQueueOrder(zero, one)).toBeLessThan(0);
    expect(compareLeadQueueOrder(one, zero)).toBeGreaterThan(0);
  });

  it("lægger voicemail-genbrug bag leads med færre forsøg, også efter cooldown", () => {
    const neverCalled = {
      status: "NEW",
      id: "fresh",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
    };
    const overdialedNoOutcome = {
      status: "NEW",
      id: "overdial",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
      lastDialAttemptAt: "2025-06-01T10:00:00.000Z",
    };
    const voicemailRecycle = {
      status: "NEW",
      id: "vm",
      importedAt: "2024-01-01T00:00:00.000Z",
      hasOutcomeLogToday: true,
      lastOutcomeAt: "2025-06-01T08:00:00.000Z",
      unansweredAttempts: 1,
    };
    expect(compareLeadQueueOrder(neverCalled, voicemailRecycle)).toBeLessThan(0);
    expect(compareLeadQueueOrder(overdialedNoOutcome, voicemailRecycle)).toBeLessThan(0);
    expect(compareLeadQueueOrder(voicemailRecycle, neverCalled)).toBeGreaterThan(0);
  });

  it("inden for samme antal forsøg kommer ældst sidste forsøg først", () => {
    const older = {
      status: "NEW",
      id: "old",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 1,
      lastOutcomeAt: "2025-06-01T08:00:00.000Z",
    };
    const newer = {
      status: "NEW",
      id: "new",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 1,
      lastOutcomeAt: "2025-06-01T10:00:00.000Z",
    };
    expect(compareLeadQueueOrder(older, newer)).toBeLessThan(0);
    expect(compareLeadQueueOrder(newer, older)).toBeGreaterThan(0);
  });

  it("inden for 0 forsøg kommer aldrig-ringede før dem med lastDialAttemptAt", () => {
    const fresh = {
      status: "NEW",
      id: "fresh",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
    };
    const dialed = {
      status: "NEW",
      id: "dialed",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
      lastDialAttemptAt: "2025-06-01T08:00:00.000Z",
    };
    expect(compareLeadQueueOrder(fresh, dialed)).toBeLessThan(0);
    expect(compareLeadQueueOrder(dialed, fresh)).toBeGreaterThan(0);
  });

  it("bruger seneste af lastOutcomeAt og lastDialAttemptAt som sidste forsøg", () => {
    const dialedAfterOutcome = {
      status: "NEW",
      id: "x",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 1,
      lastOutcomeAt: "2025-05-01T08:00:00.000Z",
      lastDialAttemptAt: "2025-06-01T08:00:00.000Z",
    };
    const onlyOldOutcome = {
      status: "NEW",
      id: "y",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 1,
      lastOutcomeAt: "2025-05-15T08:00:00.000Z",
    };
    expect(compareLeadQueueOrder(onlyOldOutcome, dialedAfterOutcome)).toBeLessThan(0);
  });

  it("behandler manglende unansweredAttempts som 0", () => {
    const missing = {
      status: "NEW",
      id: "a",
      importedAt: "2025-01-01T00:00:00.000Z",
    };
    const one = {
      status: "NEW",
      id: "b",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 1,
    };
    expect(compareLeadQueueOrder(missing, one)).toBeLessThan(0);
  });

  it("inden for samme forsøg og tid sorterer efter importedAt faldende", () => {
    const ældre = {
      status: "NEW",
      id: "x",
      importedAt: "2024-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
    };
    const nyere = {
      status: "NEW",
      id: "y",
      importedAt: "2025-06-01T00:00:00.000Z",
      unansweredAttempts: 0,
    };
    expect(compareLeadQueueOrder(nyere, ældre)).toBeLessThan(0);
  });

  it("bruger id når forsøg, tid og importedAt er ens", () => {
    const a = {
      status: "NEW",
      id: "m",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
    };
    const b = {
      status: "NEW",
      id: "n",
      importedAt: "2025-01-01T00:00:00.000Z",
      unansweredAttempts: 0,
    };
    expect(compareLeadQueueOrder(a, b)).toBeLessThan(0);
  });
});

describe("isQueueEligibleStatus", () => {
  it("ekluderer CALLBACK_SCHEDULED fra kø-navigation", () => {
    expect(isQueueEligibleStatus("CALLBACK_SCHEDULED")).toBe(false);
    expect(isQueueEligibleStatus("NEW")).toBe(true);
  });
});

describe("isLeadInRebookingDialerPool", () => {
  it("tillader Ny og genbook-markeret møde", () => {
    expect(isLeadInRebookingDialerPool({ status: "NEW", meetingOutcomeStatus: "PENDING" })).toBe(true);
    expect(isLeadInRebookingDialerPool({ status: "MEETING_BOOKED", meetingOutcomeStatus: "REBOOK" })).toBe(
      true,
    );
  });
  it("afviser ikke interesseret og ukvalificeret", () => {
    expect(
      isLeadInRebookingDialerPool({ status: "NOT_INTERESTED", meetingOutcomeStatus: "PENDING" }),
    ).toBe(false);
    expect(
      isLeadInRebookingDialerPool({ status: "UNQUALIFIED", meetingOutcomeStatus: "PENDING" }),
    ).toBe(false);
  });
  it("afviser øvrige statusser i genbook-køen", () => {
    expect(
      isLeadInRebookingDialerPool({ status: "MEETING_BOOKED", meetingOutcomeStatus: "PENDING" }),
    ).toBe(false);
    expect(isLeadInRebookingDialerPool({ status: "VOICEMAIL", meetingOutcomeStatus: "PENDING" })).toBe(false);
  });
});

describe("sortLeadsForCampaignCallQueue", () => {
  it("ordner efter færrest forsøg, derefter importedAt blandt urørte", () => {
    const rows = [
      { id: "1", status: "NEW", importedAt: "2025-01-10T00:00:00.000Z", unansweredAttempts: 1, hasOutcomeLogToday: true },
      { id: "2", status: "NEW", importedAt: "2025-01-01T00:00:00.000Z", unansweredAttempts: 0, hasOutcomeLogToday: false },
      { id: "3", status: "NEW", importedAt: "2025-01-05T00:00:00.000Z", unansweredAttempts: 0, hasOutcomeLogToday: false },
    ];
    const sorted = sortLeadsForCampaignCallQueue(rows);
    expect(sorted.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });
});
