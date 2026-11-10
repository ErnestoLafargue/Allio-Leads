import { describe, expect, it } from "vitest";
import { recordingEventDateOff } from "./telnyx-recordings-backfill";

describe("recordingEventDateOff", () => {
  const start = new Date("2026-11-10T11:01:07Z");
  it("live-flowet (logget ved opkaldets slut) er i orden", () => {
    expect(recordingEventDateOff(new Date("2026-11-10T11:02:30Z"), start, 73)).toBe(false);
  });
  it("hentet senere (fx «Hent manglende optagelser») er forkert dateret", () => {
    expect(recordingEventDateOff(new Date("2026-11-10T12:55:55Z"), start, 73)).toBe(true);
    expect(recordingEventDateOff(new Date("2026-11-10T12:56:01Z"), new Date("2026-10-19T12:11:38Z"), 4)).toBe(true);
  });
  it("uden starttid rettes intet", () => {
    expect(recordingEventDateOff(new Date(), null, 10)).toBe(false);
  });
});
