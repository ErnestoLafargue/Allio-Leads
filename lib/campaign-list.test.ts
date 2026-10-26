import { describe, expect, it } from "vitest";
import { attachCampaignListStats, countsByCampaignId } from "./campaign-list";

describe("countsByCampaignId", () => {
  it("springer null campaignId over", () => {
    const map = countsByCampaignId([
      { campaignId: "a", _count: { _all: 3 } },
      { campaignId: null, _count: { _all: 9 } },
    ]);
    expect(map.get("a")).toBe(3);
    expect(map.size).toBe(1);
  });
});

describe("attachCampaignListStats", () => {
  it("sætter 0 når kampagnen mangler i optællingerne", () => {
    const createdAt = new Date("2026-10-01T10:00:00.000Z");
    const updatedAt = new Date("2026-10-02T10:00:00.000Z");
    const [row] = attachCampaignListStats(
      [
        {
          id: "c1",
          name: "Test",
          includeProtectedBusinesses: false,
          includeLeadsWithoutPhone: true,
          isSystemCampaign: false,
          systemCampaignType: null,
          dialMode: "MANUAL",
          createdAt,
          updatedAt,
        },
      ],
      new Map(),
      new Map(),
      new Map(),
    );
    expect(row._count.leads).toBe(0);
    expect(row.agentsOnline).toBe(0);
    expect(row.myCallbacks).toBe(0);
    expect(row.createdAt).toBe(createdAt.toISOString());
  });

  it("mapper counts på kampagne-id", () => {
    const createdAt = new Date("2026-10-01T10:00:00.000Z");
    const [row] = attachCampaignListStats(
      [
        {
          id: "c1",
          name: "Test",
          includeProtectedBusinesses: false,
          includeLeadsWithoutPhone: true,
          isSystemCampaign: false,
          systemCampaignType: null,
          dialMode: "MANUAL",
          createdAt,
          updatedAt: createdAt,
        },
      ],
      new Map([["c1", 1200]]),
      new Map([["c1", 2]]),
      new Map([["c1", 4]]),
    );
    expect(row._count.leads).toBe(1200);
    expect(row.agentsOnline).toBe(2);
    expect(row.myCallbacks).toBe(4);
  });
});
