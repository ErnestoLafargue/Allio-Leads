import { describe, expect, it } from "vitest";
import { blockedSegmentsForDay, defaultBlockedTimeAssignee } from "./blocked-time-calendar";

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

describe("defaultBlockedTimeAssignee", () => {
  const sellers = [{ id: "victor" }, { id: "ernesto" }];

  it("bruger sælgeren man klikkede hos", () => {
    expect(defaultBlockedTimeAssignee(sellers, "ernesto", "victor", "victor")).toBe("ernesto");
  });

  it("bruger en selv, når man er kørende sælger og ikke klikkede hos en bestemt", () => {
    expect(defaultBlockedTimeAssignee(sellers, null, "ernesto", "victor")).toBe("ernesto");
  });

  it("falder tilbage til sælger nr. 1 for andre brugere", () => {
    expect(defaultBlockedTimeAssignee(sellers, undefined, "booker", "victor")).toBe("victor");
    expect(defaultBlockedTimeAssignee(sellers, undefined, "booker", null)).toBe("victor");
  });

  it("ignorerer en sælger, der ikke er på listen", () => {
    expect(defaultBlockedTimeAssignee(sellers, "yosef", "booker", "ernesto")).toBe("ernesto");
  });

  it("giver tom streng uden sælgere", () => {
    expect(defaultBlockedTimeAssignee([], "ernesto", "ernesto", null)).toBe("");
  });
});
