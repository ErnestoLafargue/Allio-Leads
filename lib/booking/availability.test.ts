import { describe, expect, it } from "vitest";
import {
  canBookMeetingAt,
  findBlockedTimeConflict,
  findBookingTimeConflict,
  getCopenhagenBookingSlotsForMeetingType,
  isBeyondBookingHorizon,
  lastBookableDayKey,
  hardBlocksForMeeting,
  intervalsForMeeting,
  isSlotStartBlocked,
  occupiedBlocksFromBlockedTimes,
  occupiedBlocksFromNativeOccupancy,
  occupiedBlocksFromScheduledMeetings,
  softBlocksForMeeting,
} from "./availability";

/** København sommer: UTC = lokal − 2t. Lokal 10:00 = 08:00Z. */
const physicalStart = new Date("2026-05-27T08:00:00.000Z"); // 10:00 CEST
const onlineStart = new Date("2026-05-27T08:00:00.000Z");

describe("intervalsForMeeting", () => {
  it("online: 60 min, ingen transport", () => {
    const { meeting, transports } = intervalsForMeeting(onlineStart.getTime(), "ONLINE");
    expect(meeting.endMs - meeting.startMs).toBe(60 * 60_000);
    expect(transports).toHaveLength(0);
  });

  it("fysisk: 90 min + transport 60 før/efter", () => {
    const { meeting, transports } = intervalsForMeeting(physicalStart.getTime(), "PHYSICAL");
    expect(meeting.endMs - meeting.startMs).toBe(90 * 60_000);
    expect(transports).toHaveLength(2);
    expect(transports[0]!.endMs).toBe(meeting.startMs);
    expect(transports[0]!.startMs).toBe(meeting.startMs - 60 * 60_000);
    expect(transports[1]!.startMs).toBe(meeting.endMs);
    expect(transports[1]!.endMs).toBe(meeting.endMs + 60 * 60_000);
  });
});

describe("occupiedBlocksFromBlockedTimes", () => {
  it("bruger interval uden ekstra buffer", () => {
    const blocks = occupiedBlocksFromBlockedTimes([
      {
        startDateTime: "2026-05-27T12:00:00.000Z",
        endDateTime: "2026-05-27T14:00:00.000Z",
      },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.endMs - blocks[0]!.startMs).toBe(2 * 60 * 60 * 1000);
  });
});

describe("findBlockedTimeConflict", () => {
  it("finder konflikt inde i blok", () => {
    const conflict = findBlockedTimeConflict(new Date("2026-05-27T13:00:00.000Z"), [
      {
        id: "b1",
        title: "Frokost",
        startDateTime: "2026-05-27T12:00:00.000Z",
        endDateTime: "2026-05-27T14:00:00.000Z",
      },
    ]);
    expect(conflict?.title).toBe("Frokost");
  });

  it("tillader start på blok-grænse for online", () => {
    const conflict = findBlockedTimeConflict(
      new Date("2026-05-27T14:00:00.000Z"),
      [
        {
          id: "b1",
          title: "Frokost",
          startDateTime: "2026-05-27T12:00:00.000Z",
          endDateTime: "2026-05-27T14:00:00.000Z",
        },
      ],
      "ONLINE",
    );
    expect(conflict).toBeNull();
  });

  it("tillader fysisk møde på blok-grænse selv om transport overlapper blokken", () => {
    // Blok 11–13 CEST (= 09–11Z). Fysisk start 13:00 CEST (= 11:00Z):
    // møde 13–14:30 rører ikke blokken; transport 12–13 overlapper — OK.
    const conflict = findBlockedTimeConflict(
      new Date("2026-05-27T11:00:00.000Z"),
      [
        {
          id: "b1",
          title: "Blokering",
          startDateTime: "2026-05-27T09:00:00.000Z",
          endDateTime: "2026-05-27T11:00:00.000Z",
        },
      ],
      "PHYSICAL",
    );
    expect(conflict).toBeNull();
  });

  it("afviser fysisk møde hvis møde-body overlapper blokken", () => {
    // Start 12:00 CEST (= 10:00Z) — møde 12–13:30 overlapper blok 11–13.
    const conflict = findBlockedTimeConflict(
      new Date("2026-05-27T10:00:00.000Z"),
      [
        {
          id: "b1",
          title: "Blokering",
          startDateTime: "2026-05-27T09:00:00.000Z",
          endDateTime: "2026-05-27T11:00:00.000Z",
        },
      ],
      "PHYSICAL",
    );
    expect(conflict?.title).toBe("Blokering");
  });
});

describe("manuel blokering + fysisk møde", () => {
  // Blok 11–13 CEST (= 09–11Z)
  const hardManual = occupiedBlocksFromBlockedTimes([
    {
      startDateTime: "2026-05-27T09:00:00.000Z",
      endDateTime: "2026-05-27T11:00:00.000Z",
    },
  ]);
  // Soft indeholder IKKE manuel blokering — kun møde-bodies fra andre møder.
  const softEmpty: { startMs: number; endMs: number }[] = [];

  it("13:00 fysisk er ledig når blok slutter 13:00 (transport 12–13 må overlappe)", () => {
    const slot = new Date("2026-05-27T11:00:00.000Z").getTime(); // 13:00 CEST
    expect(canBookMeetingAt(slot, "PHYSICAL", hardManual, softEmpty)).toBe(true);
    expect(canBookMeetingAt(slot, "ONLINE", hardManual, softEmpty)).toBe(true);
  });

  it("12:00 fysisk er optaget (møde-body overlapper blok)", () => {
    const slot = new Date("2026-05-27T10:00:00.000Z").getTime(); // 12:00 CEST
    expect(canBookMeetingAt(slot, "PHYSICAL", hardManual, softEmpty)).toBe(false);
  });

  it("online møde kl. 10 + blok 11–13: fysisk 13:00 stadig ledig", () => {
    const online10 = new Date("2026-05-27T08:00:00.000Z").getTime(); // 10:00 CEST
    const hard = [...hardBlocksForMeeting(online10, "ONLINE"), ...hardManual];
    const soft = softBlocksForMeeting(online10, "ONLINE");
    const slot = new Date("2026-05-27T11:00:00.000Z").getTime(); // 13:00 CEST
    expect(canBookMeetingAt(slot, "PHYSICAL", hard, soft)).toBe(true);
  });
});

describe("fysisk møde kl. 10.00 — næste slot 12.30", () => {
  const hard = hardBlocksForMeeting(physicalStart.getTime(), "PHYSICAL");
  const soft = softBlocksForMeeting(physicalStart.getTime(), "PHYSICAL");

  it("12:15 er optaget (inde i efter-transport)", () => {
    // 12:15 CEST = 10:15Z
    const slot = new Date("2026-05-27T10:15:00.000Z").getTime();
    expect(canBookMeetingAt(slot, "ONLINE", hard, soft)).toBe(false);
    expect(canBookMeetingAt(slot, "PHYSICAL", hard, soft)).toBe(false);
  });

  it("12:30 er ledig — også for nyt fysisk møde (transport må overlappe)", () => {
    // 12:30 CEST = 10:30Z
    const slot = new Date("2026-05-27T10:30:00.000Z").getTime();
    expect(canBookMeetingAt(slot, "ONLINE", hard, soft)).toBe(true);
    expect(canBookMeetingAt(slot, "PHYSICAL", hard, soft)).toBe(true);
  });

  it("10:00 er optaget (eksisterende møde)", () => {
    expect(canBookMeetingAt(physicalStart.getTime(), "ONLINE", hard, soft)).toBe(false);
  });

  it("09:00 er optaget for møde-body (transport før)", () => {
    // 09:00 CEST = 07:00Z — online møde 09–10 overlapper transport
    const slot = new Date("2026-05-27T07:00:00.000Z").getTime();
    expect(canBookMeetingAt(slot, "ONLINE", hard, soft)).toBe(false);
  });
});

describe("onlinemøde kl. 10.00 — 11.00 ledig", () => {
  const hard = hardBlocksForMeeting(onlineStart.getTime(), "ONLINE");
  const soft = softBlocksForMeeting(onlineStart.getTime(), "ONLINE");

  it("10:30 er optaget", () => {
    const slot = new Date("2026-05-27T08:30:00.000Z").getTime();
    expect(canBookMeetingAt(slot, "ONLINE", hard, soft)).toBe(false);
  });

  it("11:00 er ledig", () => {
    const slot = new Date("2026-05-27T09:00:00.000Z").getTime();
    expect(canBookMeetingAt(slot, "ONLINE", hard, soft)).toBe(true);
  });
});

describe("isSlotStartBlocked med manuel blok", () => {
  it("blokerer slot inde i manuel blok", () => {
    const occupied = occupiedBlocksFromBlockedTimes([
      {
        startDateTime: "2026-05-27T12:00:00.000Z",
        endDateTime: "2026-05-27T14:00:00.000Z",
      },
    ]);
    expect(isSlotStartBlocked(new Date("2026-05-27T13:00:00.000Z").getTime(), 15, occupied)).toBe(
      true,
    );
  });
});

describe("occupiedBlocksFromScheduledMeetings", () => {
  it("fysisk møde fylder møde + transport", () => {
    const occupied = occupiedBlocksFromScheduledMeetings([
      {
        meetingScheduledFor: physicalStart,
        meetingOutcomeStatus: "PENDING",
        meetingType: "PHYSICAL",
      },
    ]);
    // 3 blokke: transport før, møde, transport efter
    expect(occupied).toHaveLength(3);
    const spanStart = Math.min(...occupied.map((o) => o.startMs));
    const spanEnd = Math.max(...occupied.map((o) => o.endMs));
    expect(spanEnd - spanStart).toBe((60 + 90 + 60) * 60_000);
  });
});

describe("findBookingTimeConflict", () => {
  it("tillader fysisk møde kl. 12.30 efter fysisk kl. 10.00", () => {
    const existing = [
      {
        id: "l1",
        meetingScheduledFor: physicalStart,
        meetingOutcomeStatus: "PENDING",
        meetingType: "PHYSICAL",
      },
    ];
    const proposed = new Date("2026-05-27T10:30:00.000Z"); // 12:30 CEST
    expect(
      findBookingTimeConflict(proposed, existing, { proposedMeetingType: "PHYSICAL" }),
    ).toBeNull();
  });

  it("afviser fysisk møde kl. 12.15 efter fysisk kl. 10.00", () => {
    const existing = [
      {
        id: "l1",
        meetingScheduledFor: physicalStart,
        meetingOutcomeStatus: "PENDING",
        meetingType: "PHYSICAL",
      },
    ];
    const proposed = new Date("2026-05-27T10:15:00.000Z"); // 12:15 CEST
    expect(
      findBookingTimeConflict(proposed, existing, { proposedMeetingType: "ONLINE" }),
    ).toEqual({ id: "l1" });
  });
});

describe("occupiedBlocksFromNativeOccupancy", () => {
  it("bruger start + mødetype (ikke buffer oven på Native-slut)", () => {
    const start = physicalStart;
    const end = new Date(start.getTime() + 45 * 60_000); // Native end kan være forkert
    const blocks = occupiedBlocksFromNativeOccupancy([
      { startDateTime: start, endDateTime: end, meetingType: "PHYSICAL" },
    ]);
    expect(blocks).toHaveLength(3);
    const spanEnd = Math.max(...blocks.map((b) => b.endMs));
    expect(spanEnd).toBe(start.getTime() + (90 + 60) * 60_000);
  });
});

describe("fysiske møder — dynamiske tider med plads til 3 møder", () => {
  // Onsdag 2027-01-13 (vintertid: UTC = lokal − 1t). Fremtidig dag, så «nu» ikke skjuler tider.
  const DAY = "2027-01-13";
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return Date.UTC(2027, 0, 13, h - 1, m);
  };
  const ledige = (hard: number[] = [], physicalMeetingsTarget = 3) => {
    const hardBlocks = hard.flatMap((ms) => hardBlocksForMeeting(ms, "PHYSICAL"));
    const softBlocks = hard.flatMap((ms) => softBlocksForMeeting(ms, "PHYSICAL"));
    return getCopenhagenBookingSlotsForMeetingType(DAY, "PHYSICAL", hardBlocks, softBlocks, {
      physicalMeetingsBookedOnDay: hard.length,
      physicalMeetingsTarget,
    })
      .filter((s) => s.available)
      .map((s) => s.time);
  };

  it("tom dag: alle 17 halvtimer 09:00–17:00", () => {
    const times = ledige();
    expect(times).toHaveLength(17);
    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("17:00");
  });

  it("booket 12:30: kun 09:00–10:00 og 15:00–17:00", () => {
    expect(ledige([at("12:30")])).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
  });

  it("booket 10:00: næste møde fra 12:30, og 14:30 kræver at sidste møde ligger 17:00", () => {
    const times = ledige([at("10:00")]);
    expect(times[0]).toBe("12:30");
    expect(times).toContain("14:30");
    expect(times.at(-1)).toBe("17:00");
    expect(times).not.toContain("12:00");
  });

  it("booket 09:00 og 11:30: alt der stadig kan nås vises (fra 14:00)", () => {
    expect(ledige([at("09:00"), at("11:30")])).toEqual([
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
  });

  it("booket 11:00: 15:00 og 15:30 skjules, fordi de kun giver 2 møder", () => {
    // Før 11:00 er der ikke plads; efter skal der være 2½ time mellem de to sidste møder.
    expect(ledige([at("11:00")])).toEqual(["13:30", "14:00", "14:30", "16:00", "16:30", "17:00"]);
  });

  describe("standard: plads til 4 møder", () => {
    it("tom dag: 2 tider pr. møde — 09:00/09:30, 11:30/12:00, 14:00/14:30, 16:30/17:00", () => {
      expect(ledige([], 4)).toEqual([
        "09:00",
        "09:30",
        "11:30",
        "12:00",
        "14:00",
        "14:30",
        "16:30",
        "17:00",
      ]);
    });

    it("booket 09:00: resten kan stadig rykkes ½ time", () => {
      expect(ledige([at("09:00")], 4)).toEqual(["11:30", "12:00", "14:00", "14:30", "16:30", "17:00"]);
    });

    it("booket 09:30: resten låses til 12:00, 14:30 og 17:00", () => {
      expect(ledige([at("09:30")], 4)).toEqual(["12:00", "14:30", "17:00"]);
    });

    it("booket 12:00: møde 1 kan være 09:00/09:30, resten 14:30 og 17:00", () => {
      expect(ledige([at("12:00")], 4)).toEqual(["09:00", "09:30", "14:30", "17:00"]);
    });

    it("kan 4 ikke længere nås (booket 10:00), vises tider der holder 3 mulige", () => {
      expect(ledige([at("10:00")], 4)).toEqual(ledige([at("10:00")], 3));
      expect(ledige([at("10:00")], 4)[0]).toBe("12:30");
    });
  });

  it("weekend giver ingen tider", () => {
    expect(getCopenhagenBookingSlotsForMeetingType("2027-01-16", "PHYSICAL", [], [])).toEqual([]);
    expect(getCopenhagenBookingSlotsForMeetingType("2027-01-17", "ONLINE", [], [])).toEqual([]);
  });

  it("online: 09:00–17:45 hvert kvarter, ingen 3-møder-regel", () => {
    const slots = getCopenhagenBookingSlotsForMeetingType(DAY, "ONLINE", [], []);
    expect(slots[0].time).toBe("09:00");
    expect(slots.at(-1)?.time).toBe("17:45");
    expect(slots).toHaveLength(36);
  });
});

describe("bookinggrænse: denne uge + 3 uger frem til fredag", () => {
  it("fre 6/11 → sidste dag fre 27/11", () => {
    expect(lastBookableDayKey("2026-11-06")).toBe("2026-11-27");
  });

  it("søn 8/11 (stadig uge 45) → fre 27/11", () => {
    expect(lastBookableDayKey("2026-11-08")).toBe("2026-11-27");
  });

  it("man 9/11 (uge 46) → fre 4/12 — rykker en uge hver mandag", () => {
    expect(lastBookableDayKey("2026-11-09")).toBe("2026-12-04");
  });

  it("over årsskifte: tor 24/12 → fre 15/1", () => {
    expect(lastBookableDayKey("2026-12-24")).toBe("2027-01-15");
  });

  it("27/11 er med, 30/11 er låst", () => {
    expect(isBeyondBookingHorizon("2026-11-27", "2026-11-06")).toBe(false);
    expect(isBeyondBookingHorizon("2026-11-30", "2026-11-06")).toBe(true);
  });
});
