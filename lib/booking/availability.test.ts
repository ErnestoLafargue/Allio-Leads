import { describe, expect, it } from "vitest";
import {
  findBlockedTimeConflict,
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

  it("mødeblok har ±75 min buffer", () => {
    const occupied = occupiedBlocksFromScheduledMeetings([
      {
        meetingScheduledFor: new Date("2026-05-27T12:00:00.000Z"),
        meetingOutcomeStatus: "PENDING",
      },
    ]);
    const meetingStart = new Date("2026-05-27T12:00:00.000Z").getTime();
    const blockStart = meetingStart - 75 * 60 * 1000;
    expect(isSlotStartBlocked(blockStart + 60_000, 15, occupied)).toBe(true);
  });
});
