import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const lead = { allioBookingId: "b1" as string | null, meetingOutcomeStatus: "REBOOK" };

vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findUnique: vi.fn(async () => ({ ...lead })) } },
}));
vi.mock("@/lib/allio-native/sync-lead-booking", () => ({
  cancelAllioNativeBookingForLead: vi.fn(async () => {
    calls.push("cancel");
    lead.allioBookingId = null;
  }),
}));

import { shareOutcomeWithAllio } from "./send-outcome";

describe("shareOutcomeWithAllio", () => {
  beforeEach(() => {
    calls.length = 0;
    lead.allioBookingId = "b1";
    lead.meetingOutcomeStatus = "REBOOK";
    process.env.ALLIO_OS_LEADS_SECRET = "test-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        calls.push(`os:${JSON.parse(init.body).outcome}:${JSON.parse(init.body).booking_id}`);
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("Genbook: udfaldet til Allio OS først (med bookingen), så aflyses bookingen i Allio", async () => {
    await shareOutcomeWithAllio("lead1");
    expect(calls).toEqual(["os:genbook:b1", "cancel"]);
  });

  it("Genbook fra Allio OS: sendes ikke tilbage, men bookingen aflyses", async () => {
    await shareOutcomeWithAllio("lead1", { fromAllioOs: true });
    expect(calls).toEqual(["cancel"]);
  });

  it("andre udfald aflyser ikke bookingen", async () => {
    lead.meetingOutcomeStatus = "SALE";
    await shareOutcomeWithAllio("lead1");
    expect(calls).toEqual(["os:salg:b1"]);
  });

  it("Genbook uden booking i Allio gør intet", async () => {
    lead.allioBookingId = null;
    await shareOutcomeWithAllio("lead1");
    expect(calls).toEqual([]);
  });

  it("Genbook aflyser også uden Allio OS-nøgle", async () => {
    delete process.env.ALLIO_OS_LEADS_SECRET;
    await shareOutcomeWithAllio("lead1");
    expect(calls).toEqual(["cancel"]);
  });
});
