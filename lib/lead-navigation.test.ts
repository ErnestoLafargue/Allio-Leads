import { describe, expect, it } from "vitest";
import {
  buildLeadDetailHref,
  buildLeadNavigationQuery,
  isQueueMode,
  KNOWN_LEAD_SOURCES,
  LEAD_NAV_FALLBACK_PATH,
  meetingsUpcomingOpenedFrom,
  parseLeadNavigation,
  sanitizeReturnPath,
} from "./lead-navigation";

describe("sanitizeReturnPath", () => {
  it("accepterer interne stier", () => {
    expect(sanitizeReturnPath("/mine-salg")).toBe("/mine-salg");
    expect(sanitizeReturnPath("/meetings/upcoming")).toBe("/meetings/upcoming");
  });

  it("afviser eksterne og relative stier", () => {
    expect(sanitizeReturnPath("https://evil.com")).toBe(LEAD_NAV_FALLBACK_PATH);
    expect(sanitizeReturnPath("//evil.com")).toBe(LEAD_NAV_FALLBACK_PATH);
    expect(sanitizeReturnPath("/../admin")).toBe(LEAD_NAV_FALLBACK_PATH);
    expect(sanitizeReturnPath("")).toBe(LEAD_NAV_FALLBACK_PATH);
  });
});

describe("isQueueMode", () => {
  it("er true for campaign og dialer", () => {
    expect(isQueueMode("campaign")).toBe(true);
    expect(isQueueMode("dialer")).toBe(true);
    expect(isQueueMode("DIALER")).toBe(true);
  });

  it("er false for øvrige kilder", () => {
    expect(isQueueMode("mine-salg")).toBe(false);
    expect(isQueueMode("leads")).toBe(false);
    expect(isQueueMode(undefined)).toBe(false);
  });
});

describe("buildLeadDetailHref / parseLeadNavigation", () => {
  it("roundtrip for mine salg", () => {
    const href = buildLeadDetailHref("lead-1", KNOWN_LEAD_SOURCES.mineSalg);
    expect(href).toContain("/leads/lead-1?");
    expect(href).toContain("from=%2Fmine-salg");
    expect(href).toContain("source=mine-salg");

    const url = new URL(href, "http://localhost");
    const parsed = parseLeadNavigation(url.searchParams);
    expect(parsed.openedFrom.path).toBe("/mine-salg");
    expect(parsed.openedFrom.source).toBe("mine-salg");
    expect(parsed.isQueueMode).toBe(false);
  });

  it("migrerer legacy fromCampaign", () => {
    const sp = new URLSearchParams({ fromCampaign: "camp-99" });
    const parsed = parseLeadNavigation(sp);
    expect(parsed.openedFrom.path).toBe("/kampagner/camp-99");
    expect(parsed.queueCampaignId).toBe("camp-99");
    expect(parsed.querySuffix).toContain("fromCampaign=camp-99");
  });
});

describe("buildLeadNavigationQuery", () => {
  it("inkluderer fromLabel når sat", () => {
    const q = buildLeadNavigationQuery({
      path: "/historik",
      source: "history",
      label: "Historik",
    });
    expect(q).toContain("fromLabel=Historik");
  });
});

describe("meetingsUpcomingOpenedFrom", () => {
  it("bevarer kalender-view og uge i return path", () => {
    const ctx = meetingsUpcomingOpenedFrom({
      view: "calendar",
      weekStart: "2026-05-25",
    });
    expect(ctx.path).toBe("/meetings/upcoming?view=calendar&weekStart=2026-05-25");
    expect(sanitizeReturnPath(ctx.path)).toBe(ctx.path);
  });
});
