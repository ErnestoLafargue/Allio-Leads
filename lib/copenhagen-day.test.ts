import { describe, expect, it } from "vitest";
import { copenhagenWallTimeToUtc } from "./copenhagen-day";

describe("copenhagenWallTimeToUtc", () => {
  it("vintertid (UTC+1)", () => {
    expect(copenhagenWallTimeToUtc("2026-11-13", "10:00")?.toISOString()).toBe("2026-11-13T09:00:00.000Z");
  });

  it("sommertid (UTC+2)", () => {
    expect(copenhagenWallTimeToUtc("2026-06-10", "15:45")?.toISOString()).toBe("2026-06-10T13:45:00.000Z");
  });

  it("dagen hvor uret stilles frem", () => {
    expect(copenhagenWallTimeToUtc("2026-03-29", "10:00")?.toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("dagen hvor uret stilles tilbage", () => {
    expect(copenhagenWallTimeToUtc("2026-10-25", "10:00")?.toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("afviser ugyldig dato eller tid", () => {
    expect(copenhagenWallTimeToUtc("", "10:00")).toBeNull();
    expect(copenhagenWallTimeToUtc("2026-11-13", "")).toBeNull();
    expect(copenhagenWallTimeToUtc("2026-11-13", "24:00")).toBeNull();
  });
});
