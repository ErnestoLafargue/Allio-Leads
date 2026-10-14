import { describe, expect, it } from "vitest";
import {
  buildOverviewRows,
  clockedSeconds,
  compareOverviewRows,
  formatClockedDuration,
  formatClockedLive,
  formatCopenhagenDateTimeLocal,
  isValidDayKey,
  liveOpenSeconds,
  liveTodaySeconds,
  parseCopenhagenDateTimeLocal,
  punchIntervalsOverlap,
  serializeEntry,
  shiftDayKey,
  sumClockedSeconds,
  validateAdminPunchTimes,
  type TimeClockEntryLike,
} from "./time-clock";

const NOW = new Date("2026-10-12T12:00:00.000Z");

function entry(partial: Partial<TimeClockEntryLike> & Pick<TimeClockEntryLike, "id" | "userId">): TimeClockEntryLike {
  return {
    punchedInAt: new Date("2026-10-12T07:00:00.000Z"),
    punchedOutAt: new Date("2026-10-12T15:00:00.000Z"),
    dayKey: "2026-10-12",
    ...partial,
  };
}

describe("isValidDayKey", () => {
  it("godkender YYYY-MM-DD", () => {
    expect(isValidDayKey("2026-10-12")).toBe(true);
    expect(isValidDayKey("2026-10-12T12:00")).toBe(false);
    expect(isValidDayKey("")).toBe(false);
    expect(isValidDayKey(null)).toBe(false);
  });
});

describe("clockedSeconds", () => {
  it("bruger ud-tidspunkt for lukkede stemplinger", () => {
    expect(
      clockedSeconds(
        new Date("2026-10-12T07:00:00.000Z"),
        new Date("2026-10-12T15:30:00.000Z"),
        NOW,
      ),
    ).toBe(8 * 3600 + 30 * 60);
  });

  it("bruger nu for åbne stemplinger", () => {
    expect(clockedSeconds(new Date("2026-10-12T11:00:00.000Z"), null, NOW)).toBe(3600);
  });

  it("tæller nattevagter over midnat", () => {
    expect(
      clockedSeconds(
        new Date("2026-10-11T22:00:00.000Z"),
        new Date("2026-10-12T02:00:00.000Z"),
        NOW,
      ),
    ).toBe(4 * 3600);
  });

  it("giver 0 hvis ud er før ind", () => {
    expect(
      clockedSeconds(
        new Date("2026-10-12T15:00:00.000Z"),
        new Date("2026-10-12T14:00:00.000Z"),
        NOW,
      ),
    ).toBe(0);
  });
});

describe("formatClockedDuration / formatClockedLive", () => {
  it("formaterer sekunder, minutter og timer", () => {
    expect(formatClockedDuration(0)).toBe("—");
    expect(formatClockedDuration(12)).toBe("12 s");
    expect(formatClockedDuration(45 * 60)).toBe("45 m");
    expect(formatClockedDuration(7 * 3600 + 32 * 60)).toBe("7 t 32 m");
  });

  it("formaterer løbende ur med nul-padding", () => {
    expect(formatClockedLive(0)).toBe("00:00:00");
    expect(formatClockedLive(2 * 3600 + 14 * 60 + 33)).toBe("02:14:33");
  });
});

describe("shiftDayKey", () => {
  it("rykker over månedsskift", () => {
    expect(shiftDayKey("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDayKey("2026-10-12", 1)).toBe("2026-10-13");
  });
});

describe("serializeEntry / sumClockedSeconds", () => {
  it("marker åben stempling og summerer", () => {
    const open = entry({
      id: "e1",
      userId: "u1",
      punchedOutAt: null,
      punchedInAt: new Date("2026-10-12T11:00:00.000Z"),
    });
    const closed = entry({
      id: "e2",
      userId: "u1",
      punchedInAt: new Date("2026-10-12T07:00:00.000Z"),
      punchedOutAt: new Date("2026-10-12T08:00:00.000Z"),
    });
    const dto = serializeEntry(open, NOW);
    expect(dto.open).toBe(true);
    expect(dto.seconds).toBe(3600);
    expect(dto.punchedOutAt).toBeNull();
    expect(sumClockedSeconds([open, closed], NOW)).toBe(2 * 3600);
  });
});

describe("buildOverviewRows", () => {
  const users = [
    { id: "a", name: "Anne", username: "anne", role: "SELLER" },
    { id: "b", name: "Bo", username: "bo", role: "SELLER" },
    { id: "c", name: "Chris", username: "chris", role: "ADMIN" },
  ];

  it("sorterer stemplet ind først og viser tomme rækker", () => {
    const rows = buildOverviewRows({
      users,
      dayEntries: [
        entry({
          id: "e1",
          userId: "b",
          punchedInAt: new Date("2026-10-12T07:00:00.000Z"),
          punchedOutAt: new Date("2026-10-12T08:00:00.000Z"),
        }),
      ],
      openEntries: [
        entry({
          id: "e2",
          userId: "a",
          punchedOutAt: null,
          punchedInAt: new Date("2026-10-12T11:00:00.000Z"),
        }),
      ],
      now: NOW,
      includeOpenFromOtherDays: true,
    });
    expect(rows.map((r) => r.userId)).toEqual(["a", "b", "c"]);
    expect(rows[0]?.clockedIn).toBe(true);
    expect(rows[1]?.clockedIn).toBe(false);
    expect(rows[1]?.totalSeconds).toBe(3600);
    expect(rows[2]?.entries).toEqual([]);
  });

  it("lægger stemplet ind øverst, derefter tider i dag, før tomme navne", () => {
    const rows = buildOverviewRows({
      users: [
        { id: "anne", name: "Anne", username: "anne", role: "SELLER" },
        { id: "bo", name: "Bo", username: "bo", role: "SELLER" },
        { id: "zara", name: "Zara", username: "zara", role: "SELLER" },
      ],
      dayEntries: [
        entry({
          id: "out",
          userId: "anne",
          punchedInAt: new Date("2026-10-12T07:00:00.000Z"),
          punchedOutAt: new Date("2026-10-12T08:00:00.000Z"),
        }),
      ],
      openEntries: [
        entry({
          id: "in",
          userId: "zara",
          punchedOutAt: null,
          punchedInAt: new Date("2026-10-12T11:00:00.000Z"),
        }),
      ],
      now: NOW,
      includeOpenFromOtherDays: true,
    });
    expect(rows.map((r) => r.userId)).toEqual(["zara", "anne", "bo"]);
    expect(compareOverviewRows(rows[0]!, rows[1]!)).toBeLessThan(0);
  });

  it("beregner live-tid fra åben stempling uden at dobbeltælle lukkede", () => {
    const open = {
      id: "e1",
      punchedInAt: "2026-10-12T11:00:00.000Z",
      punchedOutAt: null,
      dayKey: "2026-10-12",
      seconds: 3600,
      open: true,
    };
    expect(liveOpenSeconds(open, NOW.getTime())).toBe(3600);
    expect(liveTodaySeconds({ todaySeconds: 2 * 3600, openEntry: open }, NOW.getTime())).toBe(2 * 3600);
  });

  it("tager åbne nattevagter med på i dag uden at duplikere", () => {
    const overnight = entry({
      id: "night",
      userId: "a",
      dayKey: "2026-10-11",
      punchedInAt: new Date("2026-10-11T22:00:00.000Z"),
      punchedOutAt: null,
    });
    const rows = buildOverviewRows({
      users: [users[0]!],
      dayEntries: [overnight],
      openEntries: [overnight],
      now: NOW,
      includeOpenFromOtherDays: true,
    });
    expect(rows[0]?.entries).toHaveLength(1);
    expect(rows[0]?.clockedIn).toBe(true);
    expect(rows[0]?.totalSeconds).toBe(14 * 3600);
  });
});

describe("Copenhagen datetime-local", () => {
  it("parser vinter- og sommertid som Europe/Copenhagen", () => {
    expect(parseCopenhagenDateTimeLocal("2026-01-15T08:00")?.toISOString()).toBe(
      "2026-01-15T07:00:00.000Z",
    );
    expect(parseCopenhagenDateTimeLocal("2026-07-15T08:00")?.toISOString()).toBe(
      "2026-07-15T06:00:00.000Z",
    );
  });

  it("formaterer tilbage til datetime-local", () => {
    expect(formatCopenhagenDateTimeLocal(new Date("2026-07-15T06:00:00.000Z"))).toBe(
      "2026-07-15T08:00",
    );
  });
});

describe("validateAdminPunchTimes", () => {
  it("afviser ud før ind og overlap", () => {
    const closed = {
      punchedInAt: new Date("2026-10-12T07:00:00.000Z"),
      punchedOutAt: new Date("2026-10-12T11:00:00.000Z"),
    };
    expect(
      validateAdminPunchTimes({
        punchedInAt: new Date("2026-10-12T10:00:00.000Z"),
        punchedOutAt: new Date("2026-10-12T09:00:00.000Z"),
        now: NOW,
        others: [],
      }).ok,
    ).toBe(false);
    expect(
      punchIntervalsOverlap(
        {
          punchedInAt: new Date("2026-10-12T08:00:00.000Z"),
          punchedOutAt: new Date("2026-10-12T10:00:00.000Z"),
        },
        closed,
        NOW,
      ),
    ).toBe(true);
    expect(
      validateAdminPunchTimes({
        punchedInAt: new Date("2026-10-12T08:00:00.000Z"),
        punchedOutAt: new Date("2026-10-12T10:00:00.000Z"),
        now: NOW,
        others: [closed],
      }).ok,
    ).toBe(false);
  });

  it("godkender tilstødende tider og afviser anden åben stempling", () => {
    expect(
      validateAdminPunchTimes({
        punchedInAt: new Date("2026-10-12T11:00:00.000Z"),
        punchedOutAt: new Date("2026-10-12T12:00:00.000Z"),
        now: NOW,
        others: [
          {
            punchedInAt: new Date("2026-10-12T07:00:00.000Z"),
            punchedOutAt: new Date("2026-10-12T11:00:00.000Z"),
          },
        ],
      }).ok,
    ).toBe(true);
    const open = validateAdminPunchTimes({
      punchedInAt: new Date("2026-10-12T08:00:00.000Z"),
      punchedOutAt: null,
      now: NOW,
      others: [{ punchedInAt: new Date("2026-10-12T06:00:00.000Z"), punchedOutAt: null }],
    });
    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.code).toBe("already_open");
  });
});
