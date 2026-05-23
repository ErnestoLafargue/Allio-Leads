import { describe, expect, it } from "vitest";
import {
  filterMeetingsInWeek,
  layoutMeetingColumns,
  meetingPlacement,
  parseWeekStartParam,
  startOfWeekMondayDayKey,
  weekDayKeys,
} from "./meeting-week-calendar";

describe("meeting-week-calendar", () => {
  it("finder mandag for en onsdag", () => {
    const wed = "2026-05-27";
    expect(startOfWeekMondayDayKey(new Date("2026-05-27T12:00:00+02:00"))).toBe("2026-05-25");
    expect(weekDayKeys(wed.slice(0, 8) + "25")).toHaveLength(7);
    expect(weekDayKeys("2026-05-25")[2]).toBe(wed);
  });

  it("placerer møde kl. 12:45 korrekt", () => {
    const iso = "2026-05-26T10:45:00.000Z";
    const p = meetingPlacement(iso);
    expect(p).not.toBeNull();
    expect(p!.actualTimeLabel).toBe("12:45");
    const gridStart = 9 * 60;
    const expectedTop = ((12 * 60 + 45 - gridStart) / (14 * 60)) * 100;
    expect(p!.topPct).toBeCloseTo(expectedTop, 1);
  });

  it("filtrerer møder til ugen", () => {
    const weekStart = "2026-05-25";
    const rows = [
      { id: "a", meetingScheduledFor: "2026-05-26T08:00:00.000Z" },
      { id: "b", meetingScheduledFor: "2026-06-02T08:00:00.000Z" },
    ];
    const inWeek = filterMeetingsInWeek(rows, weekStart);
    expect(inWeek.map((r) => r.id)).toEqual(["a"]);
  });

  it("layoutMeetingColumns fordeler overlappende møder", () => {
    const ids = ["m1", "m2"];
    const times: Record<string, string> = {
      m1: "2026-05-26T08:00:00.000Z",
      m2: "2026-05-26T08:15:00.000Z",
    };
    const layout = layoutMeetingColumns(ids, (id) => times[id]);
    expect(layout.get("m1")!.columnCount).toBe(2);
    expect(layout.get("m2")!.columnCount).toBe(2);
    expect(layout.get("m1")!.widthPct).toBe(50);
  });

  it("parseWeekStartParam falder tilbage til indeværende uge", () => {
    const monday = startOfWeekMondayDayKey();
    expect(parseWeekStartParam("invalid")).toBe(monday);
    expect(parseWeekStartParam(monday)).toBe(monday);
  });
});
