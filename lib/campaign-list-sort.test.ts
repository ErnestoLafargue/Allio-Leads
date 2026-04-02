import { describe, expect, it } from "vitest";
import { sortCampaignsForDisplay } from "./campaign-list-sort";

describe("sortCampaignsForDisplay", () => {
  it("placerer Aktive kunder, Kommende møder, Genbook møde øverst i den rækkefølge", () => {
    const input = [
      { name: "Zebra", systemCampaignType: null },
      { name: "Kommende møder", systemCampaignType: "upcoming_meetings" },
      { name: "Aktive kunder", systemCampaignType: "active_customers" },
      { name: "Genbook møde", systemCampaignType: "rebooking" },
    ];
    const sorted = sortCampaignsForDisplay(input);
    expect(sorted.map((c) => c.systemCampaignType)).toEqual([
      "active_customers",
      "upcoming_meetings",
      "rebooking",
      null,
    ]);
  });

  it("sorterer øvrige kampagner alfabetisk", () => {
    const input = [
      { name: "B", systemCampaignType: null },
      { name: "A", systemCampaignType: null },
    ];
    const sorted = sortCampaignsForDisplay(input);
    expect(sorted.map((c) => c.name)).toEqual(["A", "B"]);
  });
});
