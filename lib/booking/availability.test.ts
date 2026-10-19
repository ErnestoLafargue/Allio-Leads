import { describe, expect, it } from "vitest";
import {
  canBookMeetingAt,
  findBlockedTimeConflict,
  findBookingTimeConflict,
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
