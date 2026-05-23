import { describe, expect, it } from "vitest";
import { blockedSegmentsForDay } from "./blocked-time-calendar";

describe("blockedSegmentsForDay", () => {
  it("placerer blok på korrekt dag i København", () => {
    const dayKey = "2026-05-27";
    const segments = blockedSegmentsForDay(dayKey, [
      {
        id: "1",
        userId: "u1",
        title: "Frokost",
        startDateTime: "2026-05-27T10:00:00.000Z",
        endDateTime: "2026-05-27T12:00:00.000Z",
        user: { name: "Victor" },
      },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.title).toBe("Frokost");
    expect(segments[0]!.userName).toBe("Victor");
    expect(segments[0]!.topPct).toBeGreaterThan(0);
    expect(segments[0]!.heightPct).toBeGreaterThan(0);
  });

  it("ignorerer blok uden for ugedag", () => {
    const segments = blockedSegmentsForDay("2026-05-26", [
      {
        id: "1",
        userId: "u1",
        title: "Ferie",
        startDateTime: "2026-06-01T10:00:00.000Z",
        endDateTime: "2026-06-01T18:00:00.000Z",
      },
    ]);
    expect(segments).toHaveLength(0);
  });
});
