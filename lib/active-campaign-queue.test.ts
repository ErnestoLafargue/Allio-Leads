import { describe, expect, it } from "vitest";
import {
  EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW,
  hasActiveQueueViewConstraints,
  leadMatchesActiveCampaignQueueView,
  leadMatchesPostalRanges,
  parseActiveCampaignQueueView,
  postalCodeDigits,
  sortLeadsByActivePostalQueue,
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

describe("parseActiveCampaignQueueView postal", () => {
  it("parser postal-felter", () => {
    const raw = JSON.stringify({
      version: 1,
      postalFilterEnabled: true,
      postalSortDir: "desc",
      postalRanges: [{ from: "1000", to: "2999" }],
    });
    const v = parseActiveCampaignQueueView(raw);
    expect(v.postalFilterEnabled).toBe(true);
    expect(v.postalSortDir).toBe("desc");
    expect(v.postalRanges).toEqual([{ from: "1000", to: "2999" }]);
  });

  it("defaults uden postal-felter", () => {
    const v = parseActiveCampaignQueueView(JSON.stringify({ version: 1 }));
    expect(v.postalFilterEnabled).toBe(false);
    expect(v.postalSortDir).toBe("asc");
    expect(v.postalRanges).toEqual([{ from: "", to: "" }]);
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

  it("er false når postal er fra og intet andet filter", () => {
    expect(hasActiveQueueViewConstraints(EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW)).toBe(false);
  });
});

describe("leadMatchesActiveCampaignQueueView postal", () => {
  const baseLead = {
    id: "1",
    industry: "",
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
