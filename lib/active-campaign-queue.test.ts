import { describe, expect, it } from "vitest";
import {
  EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
  hasActiveQueueViewConstraints,
  leadMatchesActiveCampaignQueueView,
  leadMatchesPostalRanges,
  parseActiveCampaignQueueView,
  postalCodeDigits,
  sortLeadsByActivePostalQueue,
  syncLegacyFilterFields,
  type ActiveCampaignQueueViewV1,
} from "./active-campaign-queue";

describe("postalCodeDigits", () => {
  it("stripper ikke-cifre", () => {
    expect(postalCodeDigits("2100")).toBe(2100);
    expect(postalCodeDigits("2100 København")).toBe(2100);
    expect(postalCodeDigits("  8000  ")).toBe(8000);
  });

  it("returnerer null for tom/ugyldig", () => {
    expect(postalCodeDigits("")).toBeNull();
    expect(postalCodeDigits(null)).toBeNull();
    expect(postalCodeDigits("abc")).toBeNull();
  });
});

describe("leadMatchesPostalRanges", () => {
  it("matcher lukket interval", () => {
    expect(leadMatchesPostalRanges("2100", [{ from: "1000", to: "2999" }])).toBe(true);
    expect(leadMatchesPostalRanges("3000", [{ from: "1000", to: "2999" }])).toBe(false);
    expect(leadMatchesPostalRanges("999", [{ from: "1000", to: "2999" }])).toBe(false);
  });

  it("matcher flere intervaller", () => {
    const ranges = [
      { from: "1000", to: "2999" },
      { from: "6000", to: "9000" },
    ];
    expect(leadMatchesPostalRanges("2100", ranges)).toBe(true);
    expect(leadMatchesPostalRanges("8000", ranges)).toBe(true);
    expect(leadMatchesPostalRanges("5000", ranges)).toBe(false);
  });

  it("åbne grænser", () => {
    expect(leadMatchesPostalRanges("100", [{ from: "", to: "500" }])).toBe(true);
    expect(leadMatchesPostalRanges("9000", [{ from: "8000", to: "" }])).toBe(true);
    expect(leadMatchesPostalRanges("7000", [{ from: "8000", to: "" }])).toBe(false);
  });

  it("tomme intervaller og manglende postnr matcher ikke", () => {
    expect(leadMatchesPostalRanges("2100", [{ from: "", to: "" }])).toBe(false);
    expect(leadMatchesPostalRanges("", [{ from: "1000", to: "2999" }])).toBe(false);
  });
});

describe("parseActiveCampaignQueueView postal legacy", () => {
  it("parser postal-felter og synker legacy mode", () => {
    const raw = JSON.stringify({
      version: 1,
      postalFilterEnabled: true,
      postalSortDir: "desc",
      postalRanges: [{ from: "1000", to: "2999" }],
    });
    const v = parseActiveCampaignQueueView(raw);
    expect(v.postalFilterEnabled).toBe(true);
    expect(v.startdateEnabled).toBe(false);
    expect(v.industryEnabled).toBe(false);
    expect(v.filterMeetingStart).toBe(true);
    expect(v.campaignFilterMode).toBe("postal");
    expect(v.postalSortDir).toBe("desc");
    expect(v.postalRanges).toEqual([{ from: "1000", to: "2999" }]);
  });

  it("parser mode=postal", () => {
    const raw = JSON.stringify({
      version: 1,
      filterMeetingStart: true,
      campaignFilterMode: "postal",
      postalRanges: [{ from: "6000", to: "9000" }],
      postalSortDir: "asc",
    });
    const v = parseActiveCampaignQueueView(raw);
    expect(v.campaignFilterMode).toBe("postal");
    expect(v.postalFilterEnabled).toBe(true);
    expect(v.industryEnabled).toBe(false);
    expect(v.startdateEnabled).toBe(false);
  });

  it("parser legacy industry", () => {
    const raw = JSON.stringify({
      version: 1,
      filterMeetingStart: true,
      campaignFilterMode: "industry",
      selectedCampaignIndustries: ["031100"],
    });
    const v = parseActiveCampaignQueueView(raw);
    expect(v.industryEnabled).toBe(true);
    expect(v.startdateEnabled).toBe(false);
    expect(v.postalFilterEnabled).toBe(false);
    expect(v.campaignFilterMode).toBe("industry");
  });

  it("defaults uden postal-felter", () => {
    const v = parseActiveCampaignQueueView(JSON.stringify({ version: 1 }));
    expect(v.postalFilterEnabled).toBe(false);
    expect(v.startdateEnabled).toBe(false);
    expect(v.industryEnabled).toBe(false);
    expect(v.postalSortDir).toBe("asc");
    expect(v.postalRanges).toEqual([{ from: "", to: "" }]);
  });
});

describe("parseActiveCampaignQueueView combined flags", () => {
  it("læser uafhængige flag samtidig", () => {
    const raw = JSON.stringify({
      version: 1,
      startdateEnabled: false,
      industryEnabled: true,
      postalFilterEnabled: true,
      selectedCampaignIndustries: ["031100"],
      postalRanges: [{ from: "1000", to: "2999" }],
    });
    const v = parseActiveCampaignQueueView(raw);
    expect(v.industryEnabled).toBe(true);
    expect(v.postalFilterEnabled).toBe(true);
    expect(v.startdateEnabled).toBe(false);
    expect(v.filterMeetingStart).toBe(true);
  });
});

describe("syncLegacyFilterFields", () => {
  it("sætter mode til første tændte filter", () => {
    expect(
      syncLegacyFilterFields({
        startdateEnabled: true,
        industryEnabled: true,
        postalFilterEnabled: true,
      }),
    ).toEqual({ filterMeetingStart: true, campaignFilterMode: "startdate" });
    expect(
      syncLegacyFilterFields({
        startdateEnabled: false,
        industryEnabled: true,
        postalFilterEnabled: true,
      }),
    ).toEqual({ filterMeetingStart: true, campaignFilterMode: "industry" });
  });
});

describe("hasActiveQueueViewConstraints postal", () => {
  it("er true når postal-filter er slået til", () => {
    expect(
      hasActiveQueueViewConstraints({
        ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
        postalFilterEnabled: true,
      }),
    ).toBe(true);
  });

  it("er true når industry er til (også tom liste)", () => {
    expect(
      hasActiveQueueViewConstraints({
        ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
        industryEnabled: true,
      }),
    ).toBe(true);
  });

  it("er false når postal er fra og intet andet filter", () => {
    expect(hasActiveQueueViewConstraints(EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW)).toBe(false);
  });
});

describe("leadMatchesActiveCampaignQueueView AND", () => {
  const baseLead = {
    id: "1",
    industry: "031100",
    customFields: "{}",
    meetingScheduledFor: null,
    postalCode: "2100",
  };

  it("ekskluderer uden for interval når filter er til", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      postalFilterEnabled: true,
      postalRanges: [{ from: "6000", to: "9000" }],
    };
    expect(leadMatchesActiveCampaignQueueView(baseLead, "{}", view)).toBe(false);
    expect(
      leadMatchesActiveCampaignQueueView({ ...baseLead, postalCode: "8000" }, "{}", view),
    ).toBe(true);
  });

  it("ignoreres når filter er fra", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      postalFilterEnabled: false,
      postalRanges: [{ from: "6000", to: "9000" }],
    };
    expect(leadMatchesActiveCampaignQueueView(baseLead, "{}", view)).toBe(true);
  });

  it("branche ja + postnr nej = ude", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      industryEnabled: true,
      selectedCampaignIndustries: ["031100"],
      postalFilterEnabled: true,
      postalRanges: [{ from: "6000", to: "9000" }],
    };
    expect(leadMatchesActiveCampaignQueueView(baseLead, "{}", view)).toBe(false);
  });

  it("branche ja + postnr ja = med", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      industryEnabled: true,
      selectedCampaignIndustries: ["031100"],
      postalFilterEnabled: true,
      postalRanges: [{ from: "1000", to: "2999" }],
    };
    expect(leadMatchesActiveCampaignQueueView(baseLead, "{}", view)).toBe(true);
  });

  it("slukket branche ekskluderer ikke selvom listen er tom", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      industryEnabled: false,
      selectedCampaignIndustries: [],
      postalFilterEnabled: true,
      postalRanges: [{ from: "1000", to: "2999" }],
    };
    expect(leadMatchesActiveCampaignQueueView(baseLead, "{}", view)).toBe(true);
  });

  it("bruger postnr fra adresse når postalCode er tom", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      postalFilterEnabled: true,
      postalRanges: [{ from: "1000", to: "2999" }],
    };
    expect(
      leadMatchesActiveCampaignQueueView(
        { ...baseLead, postalCode: "", address: "Gade 1, 2100 København" },
        "{}",
        view,
      ),
    ).toBe(true);
    expect(
      leadMatchesActiveCampaignQueueView(
        { ...baseLead, postalCode: "", address: "Gade 1, 8000 Aarhus" },
        "{}",
        view,
      ),
    ).toBe(false);
  });
});

describe("sortLeadsByActivePostalQueue", () => {
  const rows = [
    {
      id: "c",
      postalCode: "8000",
      status: "NEW",
      importedAt: "2026-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    },
    {
      id: "a",
      postalCode: "1000",
      status: "NEW",
      importedAt: "2026-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    },
    {
      id: "b",
      postalCode: "5000",
      status: "NEW",
      importedAt: "2026-01-01T00:00:00.000Z",
      hasOutcomeLogToday: false,
    },
  ];

  it("sorterer asc når filter er til", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      postalFilterEnabled: true,
      postalSortDir: "asc",
    };
    expect(sortLeadsByActivePostalQueue(rows, view).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("sorterer desc når valgt", () => {
    const view: ActiveCampaignQueueViewV1 = {
      ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
      postalFilterEnabled: true,
      postalSortDir: "desc",
    };
    expect(sortLeadsByActivePostalQueue(rows, view).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
