import { describe, expect, it, afterEach } from "vitest";
import { getLeadLockMaxIdleMs, getLeadLockTtlMs, isLockActive } from "./lead-lock";

describe("getLeadLockMaxIdleMs", () => {
  const prevIdle = process.env.LEAD_LOCK_MAX_IDLE_SECONDS;
  const prevTtl = process.env.LEAD_LOCK_TTL_SECONDS;

  afterEach(() => {
    if (prevIdle === undefined) delete process.env.LEAD_LOCK_MAX_IDLE_SECONDS;
    else process.env.LEAD_LOCK_MAX_IDLE_SECONDS = prevIdle;
    if (prevTtl === undefined) delete process.env.LEAD_LOCK_TTL_SECONDS;
    else process.env.LEAD_LOCK_TTL_SECONDS = prevTtl;
  });

  it("klipper til minimum 60 s", () => {
    process.env.LEAD_LOCK_MAX_IDLE_SECONDS = "30";
    expect(getLeadLockMaxIdleMs()).toBe(60_000);
  });

  it("klipper til maximum 28800 s", () => {
    process.env.LEAD_LOCK_MAX_IDLE_SECONDS = "99999";
    expect(getLeadLockMaxIdleMs()).toBe(28_800_000);
  });

  it("bruger 900 s som standard når env mangler", () => {
    delete process.env.LEAD_LOCK_MAX_IDLE_SECONDS;
    delete process.env.LEAD_LOCK_TTL_SECONDS;
    expect(getLeadLockMaxIdleMs()).toBe(900_000);
  });

  it("getLeadLockTtlMs er alias for getLeadLockMaxIdleMs", () => {
    delete process.env.LEAD_LOCK_MAX_IDLE_SECONDS;
    delete process.env.LEAD_LOCK_TTL_SECONDS;
    expect(getLeadLockTtlMs()).toBe(getLeadLockMaxIdleMs());
  });
});

describe("isLockActive", () => {
  const idleMs = 900_000;
  const now = new Date("2026-04-02T12:00:00.000Z");

  it("er sand når lockedAt er inden for idle (seneste aktivitet)", () => {
    const lockedAt = new Date(now.getTime() - 60_000);
    expect(
      isLockActive(
        { lockedByUserId: "u1", lockedAt, lockExpiresAt: null },
        now,
      ),
    ).toBe(true);
  });

  it("er sand for legacy-række med fremtidigt lockExpiresAt", () => {
    expect(
      isLockActive(
        {
          lockedByUserId: "u1",
          lockedAt: null,
          lockExpiresAt: new Date(now.getTime() + 60_000),
        },
        now,
      ),
    ).toBe(true);
  });

  it("er falsk uden ejer", () => {
    expect(isLockActive({ lockedByUserId: null, lockedAt: new Date(), lockExpiresAt: null }, now)).toBe(
      false,
    );
  });
});
