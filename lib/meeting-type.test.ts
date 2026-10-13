import { describe, expect, it } from "vitest";
import {
  MEETING_TYPE_ONLINE,
  MEETING_TYPE_PHYSICAL,
  normalizeMeetingType,
  meetingTypeLabel,
} from "@/lib/meeting-type";

describe("normalizeMeetingType", () => {
  it("defaults to ONLINE", () => {
    expect(normalizeMeetingType(undefined)).toBe(MEETING_TYPE_ONLINE);
    expect(normalizeMeetingType("")).toBe(MEETING_TYPE_ONLINE);
  });

  it("accepts PHYSICAL / fysisk", () => {
    expect(normalizeMeetingType("PHYSICAL")).toBe(MEETING_TYPE_PHYSICAL);
    expect(normalizeMeetingType("fysisk")).toBe(MEETING_TYPE_PHYSICAL);
  });

  it("labels", () => {
    expect(meetingTypeLabel(MEETING_TYPE_ONLINE)).toBe("Onlinemøde");
    expect(meetingTypeLabel(MEETING_TYPE_PHYSICAL)).toBe("Fysisk møde");
  });
});
