import { describe, expect, it } from "vitest";
import {
  findBlockedTimeConflict,
  findBookingTimeConflict,
  isSlotStartBlocked,
  occupiedBlocksFromBlockedTimes,
  occupiedBlocksFromScheduledMeetings,
} from "./availability";

describe("occupiedBlocksFromBlockedTimes", () => {
  it("bruger interval uden buffer", () => {
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

  it("tillader start på blok-grænse", () => {
    const conflict = findBlockedTimeConflict(new Date("2026-05-27T12:00:00.000Z"), [
      {
        id: "b1",
        title: "Frokost",
        startDateTime: "2026-05-27T12:00:00.000Z",
        endDateTime: "2026-05-27T14:00:00.000Z",
      },
    ]);
    expect(conflict).toBeNull();
  });
});

describe("isSlotStartBlocked med blandet occupied", () => {
  it("blokerer slot inde i manuel blok", () => {
    const occupied = occupiedBlocksFromBlockedTimes([
      {
        startDateTime: "2026-05-27T12:00:00.000Z",
        endDateTime: "2026-05-27T14:00:00.000Z",
      },
    ]);
    expect(isSlotStartBlocked(new Date("2026-05-27T13:00:00.000Z").getTime(), 15, occupied)).toBe(true);
  });

  it("mødeblok har ±55 min buffer som default", () => {
    const occupied = occupiedBlocksFromScheduledMeetings([
      {
        meetingScheduledFor: new Date("2026-05-27T12:00:00.000Z"),
        meetingOutcomeStatus: "PENDING",
      },
    ]);
    const meetingStart = new Date("2026-05-27T12:00:00.000Z").getTime();
    const blockStart = meetingStart - 55 * 60 * 1000;
    expect(isSlotStartBlocked(blockStart + 60_000, 15, occupied)).toBe(true);
    // Uden for ±55-blokken (fx 60 min før) er tiden ledig.
    expect(isSlotStartBlocked(meetingStart - 60 * 60 * 1000, 15, occupied)).toBe(false);
  });

  it("mødeblok kan overrides til ±75 min", () => {
    const occupied = occupiedBlocksFromScheduledMeetings(
      [
        {
          meetingScheduledFor: new Date("2026-05-27T12:00:00.000Z"),
          meetingOutcomeStatus: "PENDING",
        },
      ],
      { blockBeforeMinutes: 75, blockAfterMinutes: 75 },
    );
    const meetingStart = new Date("2026-05-27T12:00:00.000Z").getTime();
    const blockStart = meetingStart - 75 * 60 * 1000;
    expect(isSlotStartBlocked(blockStart + 60_000, 15, occupied)).toBe(true);
  });
});

describe("findBookingTimeConflict med opts", () => {
  it("respekterer blockBefore/AfterMinutes-override (75)", () => {
    const existing = [
      {
        id: "l1",
        meetingScheduledFor: new Date("2026-05-27T12:00:00.000Z"),
        meetingOutcomeStatus: "PENDING",
      },
    ];
    const proposed = new Date("2026-05-27T13:00:00.000Z"); // 60 min efter
    // Default ±55: ingen konflikt.
    expect(findBookingTimeConflict(proposed, existing)).toBeNull();
    // Override ±75: konflikt.
    expect(
      findBookingTimeConflict(proposed, existing, {
        blockBeforeMinutes: 75,
        blockAfterMinutes: 75,
      }),
    ).toEqual({ id: "l1" });
  });
});
