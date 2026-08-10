import { describe, expect, it } from "vitest";
import { evaluateTargetProgress, normalizeTargetConfig } from "./targets";
import { performanceIndex } from "./metric-catalog";
import { copenhagenWeekDayKeys, resolveDashboardPeriod } from "./resolve-period";
import { isValidDashboardPublicToken, generateDashboardPublicToken } from "./public-token";

describe("dashboard targets", () => {
  it("default 3 pr. aktiv dag", () => {
    expect(normalizeTargetConfig(null).perActiveDay).toBe(3);
  });

  it("beregner mål og indeks", () => {
    const p = evaluateTargetProgress({ actual: 6, activeDays: 4 });
    expect(p.targetValue).toBe(12);
    expect(p.pctOfTarget).toBe(50);
    expect(p.index).toBe("red");
    expect(p.remaining).toBe(6);
  });

  it("grøn ved 100%", () => {
    const p = evaluateTargetProgress({ actual: 9, activeDays: 3 });
    expect(p.pctOfTarget).toBe(100);
    expect(p.index).toBe("green");
  });

  it("gul mellem 80 og 100", () => {
    const p = evaluateTargetProgress({ actual: 9, activeDays: 4 }); // 9/12 = 75% → rød
    expect(p.index).toBe("red");
    const p2 = evaluateTargetProgress({ actual: 10, activeDays: 4 }); // 83.3%
    expect(p2.index).toBe("yellow");
  });

  it("division med nul mål", () => {
    const p = evaluateTargetProgress({ actual: 0, activeDays: 0 });
    expect(p.targetValue).toBe(0);
    expect(p.pctOfTarget).toBe(0);
    expect(p.index).toBe("red");
  });
});

describe("performanceIndex", () => {
  it("tærskler", () => {
    expect(performanceIndex(79)).toBe("red");
    expect(performanceIndex(80)).toBe("yellow");
    expect(performanceIndex(99)).toBe("yellow");
    expect(performanceIndex(100)).toBe("green");
  });
});

describe("resolve-period", () => {
  it("today har én dayKey", () => {
    const p = resolveDashboardPeriod("today", new Date("2026-08-10T12:00:00+02:00"));
    expect(p.dayKeys).toEqual(["2026-08-10"]);
    expect(p.label).toBe("I dag");
  });

  it("uge er man–søn", () => {
    // 10. aug 2026 er mandag
    const keys = copenhagenWeekDayKeys("2026-08-10");
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-08-10");
    expect(keys[6]).toBe("2026-08-16");
  });

  it("this_week og this_month returnerer flere dage", () => {
    const week = resolveDashboardPeriod("this_week", new Date("2026-08-12T12:00:00+02:00"));
    expect(week.dayKeys.length).toBe(7);
    const month = resolveDashboardPeriod("this_month", new Date("2026-08-10T12:00:00+02:00"));
    expect(month.dayKeys.length).toBe(31);
  });
});

describe("public token", () => {
  it("genererer gyldigt token", () => {
    const t = generateDashboardPublicToken();
    expect(isValidDashboardPublicToken(t)).toBe(true);
  });

  it("afviser ugyldige", () => {
    expect(isValidDashboardPublicToken("")).toBe(false);
    expect(isValidDashboardPublicToken("abc")).toBe(false);
    expect(isValidDashboardPublicToken("../etc")).toBe(false);
  });
});
