import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveAdminMeetingOutcomeRouting } from "@/lib/admin-meeting-outcome-patch";
import { MEETING_OUTCOME_CANCELLED, MEETING_OUTCOME_HELD } from "@/lib/meeting-outcome";

vi.mock("@/lib/ensure-system-campaigns", () => ({
  ensureSystemCampaignId: vi.fn(async (type: string) => `campaign-${type}`),
  ensureStandardCampaignId: vi.fn(async () => "campaign-standard"),
}));

vi.mock("@/lib/meeting-campaign-routing", () => ({
  campaignIdForBookedMeetingOutcome: vi.fn(async (outcome: string) => `routed-${outcome}`),
}));

describe("resolveAdminMeetingOutcomeRouting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CANCELLED without rebooking leaves campaign unchanged", async () => {
    const r = await resolveAdminMeetingOutcomeRouting(
      MEETING_OUTCOME_CANCELLED,
      false,
      "NOT_INTERESTED",
      MEETING_OUTCOME_CANCELLED,
      false,
    );
    expect(r.campaignIdToSet).toBeUndefined();
    expect(r.statusOverride).toBeUndefined();
    expect(r.logSentToRebooking).toBe(false);
  });

  it("CANCELLED with rebooking moves to rebooking and NEW status", async () => {
    const r = await resolveAdminMeetingOutcomeRouting(
      MEETING_OUTCOME_CANCELLED,
      true,
      "NOT_INTERESTED",
      MEETING_OUTCOME_CANCELLED,
      false,
    );
    expect(r.campaignIdToSet).toBe("campaign-rebooking");
    expect(r.statusOverride).toBe("NEW");
    expect(r.logSentToRebooking).toBe(true);
  });

  it("HELD on MEETING_BOOKED lead routes campaign", async () => {
    const r = await resolveAdminMeetingOutcomeRouting(
      MEETING_OUTCOME_HELD,
      false,
      "MEETING_BOOKED",
      MEETING_OUTCOME_HELD,
      true,
    );
    expect(r.campaignIdToSet).toBe(`routed-${MEETING_OUTCOME_HELD}`);
  });
});
