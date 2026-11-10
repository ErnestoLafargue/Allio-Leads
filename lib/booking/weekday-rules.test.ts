import { describe, expect, it } from "vitest";
import {
  getCopenhagenBookingSlotsForMeetingType,
  hardBlocksForMeeting,
  softBlocksForMeeting,
} from "./availability";
import { physicalDayRule, physicalDayRuleMessage, thursdayFridayOfWeek } from "./weekday-rules";

// Uge 47, 2026: man 16/11, tir 17/11, ons 18/11, tor 19/11, fre 20/11.
describe("physicalDayRule", () => {
  it("mandag og tirsdag er salgsdage", () => {
    expect(physicalDayRule("2026-11-16").status).toBe("SALES_DAY");
    expect(physicalDayRule("2026-11-17").status).toBe("SALES_DAY");
  });

  it("torsdag og fredag er åbne", () => {
    expect(physicalDayRule("2026-11-19").status).toBe("OPEN");
    expect(physicalDayRule("2026-11-20").status).toBe("OPEN");
  });

  it("weekend", () => {
    expect(physicalDayRule("2026-11-21").status).toBe("WEEKEND");
  });

  it("onsdag uden tal er lukket", () => {
    expect(physicalDayRule("2026-11-18").status).toBe("WEDNESDAY_LOCKED");
  });

  it("onsdag lukket ved 3 + 2, åben fra 14:00 ved 3 + 3 og 4 + 4", () => {
    expect(physicalDayRule("2026-11-18", { thursday: 3, friday: 2 }).status).toBe("WEDNESDAY_LOCKED");
    expect(physicalDayRule("2026-11-18", { thursday: 2, friday: 4 }).status).toBe("WEDNESDAY_LOCKED");
    const open = physicalDayRule("2026-11-18", { thursday: 3, friday: 3 });
    expect(open.status).toBe("WEDNESDAY_AFTERNOON");
    expect(open.earliestStartMin).toBe(14 * 60);
    expect(physicalDayRule("2026-11-18", { thursday: 4, friday: 4 }).status).toBe("WEDNESDAY_AFTERNOON");
  });

  it("torsdag/fredag findes i samme uge", () => {
    expect(thursdayFridayOfWeek("2026-11-18")).toEqual({ thursday: "2026-11-19", friday: "2026-11-20" });
    // Over månedsskifte: ons 30/12 → tor 31/12, fre 1/1
    expect(thursdayFridayOfWeek("2026-12-30")).toEqual({ thursday: "2026-12-31", friday: "2027-01-01" });
  });

  it("kort besked for lukket onsdag, ingen for åbne dage", () => {
    expect(physicalDayRuleMessage(physicalDayRule("2026-11-18", { thursday: 2, friday: 3 }))).toBe(
      "Onsdag er lukket for fysiske møder.",
    );
    expect(physicalDayRuleMessage(physicalDayRule("2026-11-19"))).toBeNull();
  });
});

describe("onsdag åben fra 14:00 — kun møde 3 og 4", () => {
  // Vintertid: UTC = lokal − 1t
  const WED = "2026-11-18";
  const at = (h: number, m: number) => Date.UTC(2026, 10, 18, h - 1, m);
  const ledige = (booked: number[], target = 4) =>
    getCopenhagenBookingSlotsForMeetingType(
      WED,
      "PHYSICAL",
      booked.flatMap((s) => hardBlocksForMeeting(s, "PHYSICAL")),
      booked.flatMap((s) => softBlocksForMeeting(s, "PHYSICAL")),
      { physicalMeetingsBookedOnDay: booked.length, physicalMeetingsTarget: target, earliestStartMin: 14 * 60 },
    )
      .filter((s) => s.available)
      .map((s) => s.time);

  it("tom onsdag: 14:00/14:30 og 16:30/17:00", () => {
    expect(ledige([])).toEqual(["14:00", "14:30", "16:30", "17:00"]);
  });

  it("Overskrid på onsdag giver det samme: kun 2 møder kan nås efter 14:00, og de beskyttes", () => {
    expect(ledige([], 3)).toEqual(["14:00", "14:30", "16:30", "17:00"]);
  });

  it("booket 14:30: kun 17:00 tilbage", () => {
    expect(ledige([at(14, 30)])).toEqual(["17:00"]);
  });
});
