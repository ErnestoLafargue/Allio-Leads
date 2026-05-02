import { describe, expect, it } from "vitest";
import {
  compareLeadQueueOrder,
  isLeadInRebookingDialerPool,
  isQueueEligibleStatus,
  sortLeadsForCampaignCallQueue,
} from "./lead-queue";

describe("compareLeadQueueOrder", () => {
  it("placerer leads uden udfaldslog i dag før dem med", () => {
    const uden = {
      status: "NEW",
      id: "a",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    };
    const med = {
      status: "NEW",
      id: "b",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: true,
    };
    expect(compareLeadQueueOrder(uden, med)).toBeLessThan(0);
    expect(compareLeadQueueOrder(med, uden)).toBeGreaterThan(0);
  });

  it("inden for samme udfalds-gruppe sorterer efter importedAt faldende", () => {
    const ældre = {
      status: "NEW",
      id: "x",
      importedAt: "2024-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    };
    const nyere = {
      status: "NEW",
      id: "y",
      importedAt: "2025-06-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    };
    expect(compareLeadQueueOrder(nyere, ældre)).toBeLessThan(0);
  });

  it("bruger id når importedAt er ens", () => {
    const a = {
      status: "NEW",
      id: "m",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    };
    const b = {
      status: "NEW",
      id: "n",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    };
    expect(compareLeadQueueOrder(a, b)).toBeLessThan(0);
  });

  it("behandler manglende hasOutcomeLogToday som false", () => {
    const a = { status: "NEW", id: "a", importedAt: "2025-01-01T00:00:00.000Z" };
    const b = {
      status: "NEW",
      id: "b",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: true,
    };
    expect(compareLeadQueueOrder(a, b)).toBeLessThan(0);
  });

  it("placerer urørte leads før dem der er dialet uden gemt udfald (lastDialAttemptAt)", () => {
    const fresh = {
      status: "NEW",
      id: "fresh",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    };
    const dialed = {
      status: "NEW",
      id: "dialed",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
      lastDialAttemptAt: "2025-06-01T08:00:00.000Z",
    };
    expect(compareLeadQueueOrder(fresh, dialed)).toBeLessThan(0);
    expect(compareLeadQueueOrder(dialed, fresh)).toBeGreaterThan(0);
  });

  it("blandt rørte leads sorteres ældste touch først (uanset om touch er udfald eller dial)", () => {
    const oldDial = {
      status: "NEW",
      id: "old",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
      lastDialAttemptAt: "2025-06-01T08:00:00.000Z",
    };
    const recentOutcome = {
      status: "NEW",
      id: "recent",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
      lastOutcomeAt: "2025-06-02T08:00:00.000Z",
    };
    expect(compareLeadQueueOrder(oldDial, recentOutcome)).toBeLessThan(0);
    expect(compareLeadQueueOrder(recentOutcome, oldDial)).toBeGreaterThan(0);
  });

  it("bruger seneste af lastOutcomeAt og lastDialAttemptAt som touch-tidspunkt", () => {
    const dialedAfterOutcome = {
      status: "NEW",
      id: "x",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
      lastOutcomeAt: "2025-05-01T08:00:00.000Z",
      lastDialAttemptAt: "2025-06-01T08:00:00.000Z",
    };
    const onlyOldOutcome = {
      status: "NEW",
      id: "y",
      importedAt: "2025-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
      lastOutcomeAt: "2025-05-15T08:00:00.000Z",
    };
    expect(compareLeadQueueOrder(onlyOldOutcome, dialedAfterOutcome)).toBeLessThan(0);
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
  it("ordner efter hasOutcomeLogToday derefter importedAt", () => {
    const rows = [
      { id: "1", status: "NEW", importedAt: "2025-01-10T00:00:00.000Z", hasOutcomeLogToday: true },
      { id: "2", status: "NEW", importedAt: "2025-01-01T00:00:00.000Z", hasOutcomeLogToday: false },
      { id: "3", status: "NEW", importedAt: "2025-01-05T00:00:00.000Z", hasOutcomeLogToday: false },
    ];
    const sorted = sortLeadsForCampaignCallQueue(rows);
    expect(sorted.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });
});
