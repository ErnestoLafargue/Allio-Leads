import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calBookingNeedsRefresh,
  calBookingStartMatches,
  isCalBookingInactive,
} from "@/lib/calcom/fetch-booking";

describe("isCalBookingInactive", () => {
  it("marks cancelled and rejected as inactive", () => {
    expect(isCalBookingInactive("cancelled")).toBe(true);
    expect(isCalBookingInactive("rejected")).toBe(true);
    expect(isCalBookingInactive("accepted")).toBe(false);
  });
});

describe("calBookingStartMatches", () => {
  it("matches within tolerance", () => {
    const scheduled = new Date("2026-07-21T07:00:00.000Z");
    expect(calBookingStartMatches("2026-07-21T07:00:30.000Z", scheduled)).toBe(true);
  });

  it("rejects when start differs beyond tolerance", () => {
    const scheduled = new Date("2026-07-21T07:00:00.000Z");
    expect(calBookingStartMatches("2026-07-21T09:00:00.000Z", scheduled)).toBe(false);
  });
});

describe("calBookingNeedsRefresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CALCOM_API_KEY;
  });

  beforeEach(() => {
    process.env.CALCOM_API_KEY = "test-key";
  });

  it("returns true when uid is missing", async () => {
    expect(
      await calBookingNeedsRefresh({
        calComBookingUid: null,
        meetingScheduledFor: new Date("2026-07-21T07:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("returns false when meetingScheduledFor is missing", async () => {
    expect(
      await calBookingNeedsRefresh({
        calComBookingUid: "abc",
        meetingScheduledFor: null,
      }),
    ).toBe(false);
  });

  it("returns true when Cal booking is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            uid: "old-uid",
            status: "cancelled",
            start: "2026-07-21T07:00:00.000Z",
          },
        }),
      }),
    );

    expect(
      await calBookingNeedsRefresh({
        calComBookingUid: "old-uid",
        meetingScheduledFor: new Date("2026-08-01T09:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("returns true when Cal start differs from Allio time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            uid: "uid-1",
            status: "accepted",
            start: "2026-07-21T07:00:00.000Z",
          },
        }),
      }),
    );

    expect(
      await calBookingNeedsRefresh({
        calComBookingUid: "uid-1",
        meetingScheduledFor: new Date("2026-08-01T09:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("returns false when active Cal booking matches Allio time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            uid: "uid-1",
            status: "accepted",
            start: "2026-07-21T07:00:00.000Z",
          },
        }),
      }),
    );

    expect(
      await calBookingNeedsRefresh({
        calComBookingUid: "uid-1",
        meetingScheduledFor: new Date("2026-07-21T07:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("returns true when Cal booking not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    expect(
      await calBookingNeedsRefresh({
        calComBookingUid: "missing",
        meetingScheduledFor: new Date("2026-07-21T07:00:00.000Z"),
      }),
    ).toBe(true);
  });
});
