import { describe, expect, it } from "vitest";
import {
  isFutureMeetingTime,
  isNewMeetingBookingConfirm,
  leadMeetingRecordCreateInput,
} from "@/lib/lead-meeting-archive";

describe("isNewMeetingBookingConfirm", () => {
  it("returns false without prior booking", () => {
    expect(
      isNewMeetingBookingConfirm(
        { meetingBookedAt: null, meetingScheduledFor: new Date("2026-05-10T10:00:00Z") },
        new Date("2026-05-20T10:00:00Z"),
      ),
    ).toBe(false);
  });

  it("returns true when scheduled time changes", () => {
    const old = new Date("2026-05-10T10:00:00Z");
    const next = new Date("2026-05-20T10:00:00Z");
    expect(
      isNewMeetingBookingConfirm(
        { meetingBookedAt: new Date("2026-05-01T10:00:00Z"), meetingScheduledFor: old },
        next,
      ),
    ).toBe(true);
  });

  it("returns false when scheduled time unchanged", () => {
    const t = new Date("2026-05-10T10:00:00Z");
    expect(
      isNewMeetingBookingConfirm(
        { meetingBookedAt: new Date("2026-05-01T10:00:00Z"), meetingScheduledFor: t },
        t,
      ),
    ).toBe(false);
  });
});

describe("isFutureMeetingTime", () => {
  it("returns true for times on or after today start Copenhagen", () => {
    const now = new Date("2026-05-21T12:00:00Z");
    const future = new Date("2026-05-25T10:00:00Z");
    expect(isFutureMeetingTime(future, now)).toBe(true);
  });
});

describe("leadMeetingRecordCreateInput", () => {
  it("builds create input from lead snapshot", () => {
    const bookedAt = new Date("2026-05-01T10:00:00Z");
    const scheduled = new Date("2026-05-10T10:00:00Z");
    const input = leadMeetingRecordCreateInput(
      {
        id: "lead1",
        bookedByUserId: "user1",
        meetingBookedAt: bookedAt,
        meetingScheduledFor: scheduled,
        meetingOutcomeStatus: "CANCELLED",
        meetingCommissionDayKey: "2026-05-01",
        bookedFromRebookingCampaign: false,
        meetingContactName: "A",
        meetingContactEmail: "a@b.dk",
        meetingContactPhonePrivate: "+4512345678",
      },
      "rebooked",
    );
    expect(input.archivedReason).toBe("rebooked");
    expect(input.meetingOutcomeStatus).toBe("CANCELLED");
  });
});
