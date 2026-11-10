import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { makeLead, sharedInMemoryLeadDb as mem } from "./test-helpers/in-memory-lead-db";

vi.mock("@/lib/prisma", async () => {
  const { sharedInMemoryLeadDb } = await import("./test-helpers/in-memory-lead-db");
  return { prisma: sharedInMemoryLeadDb.db };
});

import { applyLeadCooldownResets } from "./lead-cooldown";
import {
  explainCallbackReservedForOtherUser,
  reserveNextNewLeadFromCampaign,
  reserveNextPendingCallback,
  tryReserveLead,
  type ReserveCampaignSlice,
} from "./campaign-queue-reserve";

const db = mem.db as unknown as PrismaClient;

const campaign: ReserveCampaignSlice = {
  id: "camp-1",
  dialMode: "CLICK_TO_CALL",
  includeProtectedBusinesses: true,
  includeLeadsWithoutPhone: true,
  systemCampaignType: null,
  fieldConfig: "{}",
  activeQueueFilter: "{}",
  maxContactAttempts: null,
};

/** Samme rækkefølge som POST /api/campaigns/[id]/reserve-next uden explicitLeadId. */
async function pressNextLead(userId: string, now = new Date()) {
  await applyLeadCooldownResets();
  const callback = await reserveNextPendingCallback({
    db,
    userId,
    now,
    excludedLeadIds: new Set(),
    allowedCampaignIds: null,
  });
  if (callback) return callback;
  return reserveNextNewLeadFromCampaign({
    db,
    userId,
    now,
    campaign,
    excludedLeadIds: new Set(),
    workspaceStartFilter: null,
  });
}

describe("tilbagekald er låst til ejeren i dialeren", () => {
  const users = [
    { id: "user-a", name: "Hannibal" },
    { id: "user-b", name: "Mathias" },
    { id: "admin-1", name: "Ernesto" },
  ];

  beforeEach(() => {
    mem.reset(
      [
        makeLead({
          id: "cb",
          companyName: "Tilbagekald ApS",
          status: "CALLBACK_SCHEDULED",
          notes: "Hannibals noter",
          callbackReservedByUserId: "user-a",
          callbackCreatedByUserId: "user-a",
          callbackScheduledFor: new Date(Date.now() + 60 * 60_000),
        }),
        makeLead({ id: "new", companyName: "Ny ApS" }),
      ],
      users,
    );
  });

  it("forfaldent tilbagekald, som ejeren har åbnet, går aldrig videre til en anden ved «næste lead»", async () => {
    const cb = mem.lead("cb");
    cb.callbackScheduledFor = new Date(Date.now() - 60_000);
    cb.callbackSeenByAssigneeAt = new Date(Date.now() - 30_000);

    // A får sit forfaldne tilbagekald først.
    const forA = await pressNextLead("user-a");
    expect(forA?.id).toBe("cb");

    // B trykker «næste lead» lige efter og får det almindelige «Ny»-lead — ikke A's tilbagekald.
    const forB = await pressNextLead("user-b");
    expect(forB?.id).toBe("new");

    // B gemmer et udfald og trykker igen: intet til B; tilbagekaldet er stadig A's.
    mem.lead("new").status = "NOT_INTERESTED";
    expect(await pressNextLead("user-b")).toBeNull();
    expect(mem.lead("cb")).toMatchObject({
      status: "CALLBACK_SCHEDULED",
      callbackReservedByUserId: "user-a",
      lockedByUserId: "user-a",
    });
  });

  it("også når A ikke har åbnet det, og ingen har låst det", async () => {
    mem.lead("cb").callbackScheduledFor = new Date(Date.now() - 60 * 60_000);
    mem.lead("new").status = "NOT_INTERESTED";
    expect(await pressNextLead("user-b")).toBeNull();
    expect(mem.lead("cb").lockedByUserId).toBeNull();
  });

  it("klik i liste/historik (explicitLeadId): en anden sælger afvises med en klar besked", async () => {
    const got = await tryReserveLead({
      db,
      leadId: "cb",
      userId: "user-b",
      now: new Date(),
      systemCampaignType: null,
      explicitOpen: true,
    });
    expect(got).toBeNull();
    expect(mem.lead("cb").lockedByUserId).toBeNull();
    expect(mem.visits).toHaveLength(0);
    expect(await explainCallbackReservedForOtherUser({ db, leadId: "cb", userId: "user-b" })).toContain(
      "hos Hannibal",
    );
  });

  it("ingen admin-undtagelse i dialeren: admin får heller ikke en andens tilbagekald", async () => {
    const got = await tryReserveLead({
      db,
      leadId: "cb",
      userId: "admin-1",
      now: new Date(),
      systemCampaignType: null,
      explicitOpen: true,
    });
    expect(got).toBeNull();
  });

  it("ejeren kan altid åbne sit eget tilbagekald (også før tid)", async () => {
    const got = await tryReserveLead({
      db,
      leadId: "cb",
      userId: "user-a",
      now: new Date(),
      systemCampaignType: null,
      explicitOpen: true,
    });
    expect(got?.notes).toBe("Hannibals noter");
    expect(await explainCallbackReservedForOtherUser({ db, leadId: "cb", userId: "user-a" })).toBeNull();
  });

  it("låsen ophører, når udfaldet flyttes væk fra tilbagekald", async () => {
    // Svarer til at A gemmer «Ikke hjemme» → PATCH rydder tilbagekaldsfelterne.
    Object.assign(mem.lead("cb"), {
      status: "NEW",
      callbackScheduledFor: null,
      callbackReservedByUserId: null,
      callbackCreatedByUserId: null,
    });
    mem.lead("new").status = "NOT_INTERESTED";
    expect((await pressNextLead("user-b"))?.id).toBe("cb");
  });

  it("race: bliver leadet en andens tilbagekald mellem lås og læsning, slippes låsen igen", async () => {
    const original = mem.db.lead.findUnique;
    mem.db.lead.findUnique = async (args) => {
      // Admin planlægger tilbagekald til A i samme øjeblik, som B låser leadet.
      Object.assign(mem.lead("new"), {
        status: "CALLBACK_SCHEDULED",
        callbackReservedByUserId: "user-a",
      });
      return original(args);
    };
    try {
      const got = await tryReserveLead({
        db,
        leadId: "new",
        userId: "user-b",
        now: new Date(),
        systemCampaignType: null,
        explicitOpen: true,
      });
      expect(got).toBeNull();
      expect(mem.lead("new").lockedByUserId).toBeNull();
    } finally {
      mem.db.lead.findUnique = original;
    }
  });
});
