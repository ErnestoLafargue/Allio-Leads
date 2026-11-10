import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeLead, sharedInMemoryLeadDb as mem } from "./test-helpers/in-memory-lead-db";

vi.mock("@/lib/prisma", async () => {
  const { sharedInMemoryLeadDb } = await import("./test-helpers/in-memory-lead-db");
  return { prisma: sharedInMemoryLeadDb.db };
});

import * as cooldown from "./lead-cooldown";

describe("applyLeadCooldownResets — tilbagekald", () => {
  const hourAgo = new Date(Date.now() - 60 * 60_000);

  beforeEach(() => {
    mem.reset([
      makeLead({
        id: "cb",
        status: "CALLBACK_SCHEDULED",
        notes: "A's noter",
        callbackReservedByUserId: "user-a",
        callbackCreatedByUserId: "user-a",
        callbackScheduledFor: hourAgo,
        // A har allerede været inde på leadet — det var det, der tidligere frigav det til alle.
        callbackSeenByAssigneeAt: new Date(hourAgo.getTime() - 60_000),
        lockedByUserId: "user-a",
        lockedAt: new Date(),
        lockExpiresAt: new Date(Date.now() + 60_000),
      }),
      makeLead({
        id: "vm",
        status: "VOICEMAIL",
        voicemailMarkedAt: new Date(Date.now() - 48 * 60 * 60_000),
      }),
    ]);
  });

  it("forfaldent, set tilbagekald forbliver låst til ejeren (frigives ikke til «Ny»)", async () => {
    await cooldown.applyLeadCooldownResets();
    const cb = mem.lead("cb");
    expect(cb.status).toBe("CALLBACK_SCHEDULED");
    expect(cb.callbackReservedByUserId).toBe("user-a");
    expect(cb.callbackScheduledFor).toEqual(hourAgo);
    // A's aktive lås fjernes heller ikke midt i opkaldet.
    expect(cb.lockedByUserId).toBe("user-a");
    expect(mem.outcomeLogs.filter((l) => l.leadId === "cb")).toHaveLength(0);
  });

  it("voicemail-cooldown virker stadig", async () => {
    await cooldown.applyLeadCooldownResets();
    expect(mem.lead("vm").status).toBe("NEW");
  });

  it("den automatiske frigivelse af forfaldne tilbagekald findes ikke længere", () => {
    expect("releaseStaleCallbacksToCampaignPool" in cooldown).toBe(false);
  });
});
