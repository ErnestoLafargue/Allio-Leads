import { describe, expect, it } from "vitest";
import {
  compareLeadQueueOrder,
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
});

describe("isQueueEligibleStatus", () => {
  it("ekluderer CALLBACK_SCHEDULED fra kø-navigation", () => {
    expect(isQueueEligibleStatus("CALLBACK_SCHEDULED")).toBe(false);
    expect(isQueueEligibleStatus("NEW")).toBe(true);
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
