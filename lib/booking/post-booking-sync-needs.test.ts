import { describe, expect, it } from "vitest";
import { leadNeedsPostBookingSync } from "@/lib/booking/post-booking-sync-needs";

const base = {
  podioItemId: "123",
  meetingScheduledFor: new Date("2026-06-25T10:00:00Z"),
  meetingContactEmail: "a@b.dk",
  meetingContactName: "Anna",
  meetingContactPhonePrivate: "+4512345678",
  meetingCompanyName: "Firma ApS",
  calComBookingUid: "cal-uid-1",
};

describe("leadNeedsPostBookingSync", () => {
  it("returns false when nothing changed (gentagen bekræft)", () => {
    expect(leadNeedsPostBookingSync(base, { ...base })).toBe(false);
  });

  it("returns true when podioItemId mangler", () => {
    expect(
      leadNeedsPostBookingSync(
        { ...base, podioItemId: null },
        { ...base, podioItemId: null },
      ),
    ).toBe(true);
  });

  it("returns true when mødetid ændres", () => {
    expect(
      leadNeedsPostBookingSync(base, {
        ...base,
        meetingScheduledFor: new Date("2026-06-26T10:00:00Z"),
      }),
    ).toBe(true);
  });

  it("returns true when cal uid mangler", () => {
    expect(
      leadNeedsPostBookingSync({ ...base, calComBookingUid: null }, base),
    ).toBe(true);
  });
});
