import { describe, expect, it } from "vitest";
import { dialableAgentsForCampaignCapacityWhere } from "@/lib/power-dialer-engine";

describe("dialableAgentsForCampaignCapacityWhere", () => {
  it("inkluderer både enkeltkampagne- og tildelte Power-pulje-sessioner", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const where = dialableAgentsForCampaignCapacityWhere("camp_a", now);
    const json = JSON.stringify(where);
    expect(json).toContain('"powerPool":false');
    expect(json).toContain('"powerPool":true');
    expect(json).toContain("campaignAssignments");
    expect(json).toContain("camp_a");
  });
});
