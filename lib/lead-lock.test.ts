import { describe, expect, it, afterEach, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  getLeadLockMaxIdleMs,
  getLeadLockTtlMs,
  isLockActive,
  refreshLeadLock,
  tryAcquireLeadLock,
} from "./lead-lock";
import { createInMemoryLeadDb, makeLead } from "./test-helpers/in-memory-lead-db";

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

describe("tryAcquireLeadLock — tilbagekaldslås", () => {
  const mem = createInMemoryLeadDb();
  const db = mem.db as unknown as PrismaClient;
  const now = new Date("2026-11-10T13:00:00.000Z");
  const dueCallbackForA = () =>
    makeLead({
      id: "cb",
      status: "CALLBACK_SCHEDULED",
      callbackReservedByUserId: "user-a",
      callbackScheduledFor: new Date(now.getTime() - 60 * 60_000),
      callbackSeenByAssigneeAt: new Date(now.getTime() - 2 * 60 * 60_000),
      notes: "A's noter",
    });

  beforeEach(() => {
    mem.reset([dueCallbackForA(), makeLead({ id: "new" })]);
  });

  it("en anden sælger kan ikke låse et forfaldent tilbagekald, selv om ingen har låst det", async () => {
    expect(await tryAcquireLeadLock(db, "cb", "user-b", now)).toBe(false);
    expect(mem.lead("cb").lockedByUserId).toBeNull();
  });

  it("ejeren kan låse sit eget tilbagekald", async () => {
    expect(await tryAcquireLeadLock(db, "cb", "user-a", now)).toBe(true);
    expect(mem.lead("cb").lockedByUserId).toBe("user-a");
  });

  it("tilbagekald uden tildelt kan ikke låses fra dialeren", async () => {
    mem.lead("cb").callbackReservedByUserId = null;
    expect(await tryAcquireLeadLock(db, "cb", "user-a", now)).toBe(false);
  });

  it("bevidst åbning (allowOtherUsersCallback) må låse en andens tilbagekald", async () => {
    expect(await tryAcquireLeadLock(db, "cb", "user-b", now)).toBe(false);
    expect(
      await tryAcquireLeadLock(db, "cb", "user-b", now, { allowOtherUsersCallback: true }),
    ).toBe(true);
  });

  it("almindelige «Ny»-leads låses som før — og kun af én ad gangen", async () => {
    expect(await tryAcquireLeadLock(db, "new", "user-a", now)).toBe(true);
    expect(await tryAcquireLeadLock(db, "new", "user-b", now)).toBe(false);
    expect(mem.lead("new").lockedByUserId).toBe("user-a");
  });

  it("heartbeat kan ikke forlænge en lås, når leadet er blevet en andens tilbagekald", async () => {
    mem.reset([
      makeLead({
        id: "cb",
        status: "CALLBACK_SCHEDULED",
        callbackReservedByUserId: "user-a",
        lockedByUserId: "user-b",
        lockedAt: now,
        lockExpiresAt: new Date(now.getTime() + 60_000),
      }),
    ]);
    expect(await refreshLeadLock(db, "cb", "user-b", now)).toBe(false);
    // Når B's gamle lås er udløbet, kan ejeren overtage.
    const later = new Date(now.getTime() + getLeadLockMaxIdleMs() + 60_000);
    expect(await refreshLeadLock(db, "cb", "user-a", later)).toBe(true);
    expect(mem.lead("cb").lockedByUserId).toBe("user-a");
  });
});
