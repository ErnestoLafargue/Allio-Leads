import { describe, expect, it } from "vitest";
import { buildLeadCampaignAttribution } from "./lead-campaign-attribution";

describe("buildLeadCampaignAttribution", () => {
  const visits = [
    { leadId: "l1", campaignId: "camp_a", visitedAt: new Date("2026-08-04T08:00:00.000Z") },
    { leadId: "l1", campaignId: "camp_b", visitedAt: new Date("2026-08-04T12:00:00.000Z") },
    { leadId: "l2", campaignId: null, visitedAt: new Date("2026-08-04T09:00:00.000Z") },
  ];

  it("bruger seneste besøg før hændelsen", () => {
    const a = buildLeadCampaignAttribution(visits);
    expect(a.campaignIdAt("l1", new Date("2026-08-04T10:00:00.000Z"))).toBe("camp_a");
    expect(a.campaignIdAt("l1", new Date("2026-08-04T13:00:00.000Z"))).toBe("camp_b");
  });

  it("falder tilbage til første besøg når hændelsen ligger før alle besøg", () => {
    const a = buildLeadCampaignAttribution(visits);
    expect(a.campaignIdAt("l1", new Date("2026-08-04T07:00:00.000Z"))).toBe("camp_a");
  });

  it("returnerer null for ukendt lead eller kun besøg uden kampagne", () => {
    const a = buildLeadCampaignAttribution(visits);
    expect(a.campaignIdAt("l2", new Date("2026-08-04T10:00:00.000Z"))).toBeNull();
    expect(a.campaignIdAt("ukendt", new Date())).toBeNull();
  });
});
