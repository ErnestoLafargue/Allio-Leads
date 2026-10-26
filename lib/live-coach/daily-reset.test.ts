import { describe, expect, it } from "vitest";
import { liveCoachDayKey, nextLiveCoachResetAt } from "./daily-reset";

describe("liveCoachDayKey", () => {
  it("før 08:00 hører til gårsdagen", () => {
    // 2026-10-15 07:59 Europe/Copenhagen = 05:59 UTC (CEST)
    const before = new Date("2026-10-15T05:59:00.000Z");
    expect(liveCoachDayKey(before)).toBe("2026-10-14");
  });

  it("fra 08:00 hører til i dag", () => {
    // 2026-10-15 08:00 Europe/Copenhagen = 06:00 UTC
    const atEight = new Date("2026-10-15T06:00:00.000Z");
    expect(liveCoachDayKey(atEight)).toBe("2026-10-15");
  });
});

describe("nextLiveCoachResetAt", () => {
  it("peger på i dag kl. 08 hvis vi er før", () => {
    const before = new Date("2026-10-15T05:59:00.000Z");
    expect(nextLiveCoachResetAt(before).toISOString()).toBe("2026-10-15T06:00:00.000Z");
  });

  it("peger på i morgen kl. 08 hvis vi er efter", () => {
    const after = new Date("2026-10-15T06:00:01.000Z");
    expect(nextLiveCoachResetAt(after).toISOString()).toBe("2026-10-16T06:00:00.000Z");
  });
});
