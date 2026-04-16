import { describe, expect, it } from "vitest";
import {
  COMMISSION_REBOOKING_FLAT_KR,
  commissionKrForBookedDay,
  forventetProvisionKrForBookedDay,
  rateKrPerHeldMeeting,
} from "./commission";
import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
} from "./meeting-outcome";

describe("commissionKrForBookedDay", () => {
  it("genbooking afholdte giver fast sats og tæller ikke i trappe for standard", () => {
    const c = commissionKrForBookedDay([
      { meetingOutcomeStatus: MEETING_OUTCOME_HELD, bookedFromRebookingCampaign: true },
      { meetingOutcomeStatus: MEETING_OUTCOME_HELD, bookedFromRebookingCampaign: false },
    ]);
    expect(c.heldRebookingCount).toBe(1);
    expect(c.heldStandardCount).toBe(1);
    expect(c.ratePerHeldStandard).toBe(rateKrPerHeldMeeting(1));
    expect(c.kr).toBe(COMMISSION_REBOOKING_FLAT_KR + 200);
  });

  it("kun genbooking: 100 kr pr. stk.", () => {
    const c = commissionKrForBookedDay([
      { meetingOutcomeStatus: MEETING_OUTCOME_HELD, bookedFromRebookingCampaign: true },
      { meetingOutcomeStatus: MEETING_OUTCOME_HELD, bookedFromRebookingCampaign: true },
    ]);
    expect(c.kr).toBe(2 * COMMISSION_REBOOKING_FLAT_KR);
    expect(c.ratePerHeldStandard).toBe(0);
  });

  it("tre standard afholdte uden genbooking: 3×300", () => {
    const c = commissionKrForBookedDay([
      { meetingOutcomeStatus: MEETING_OUTCOME_HELD },
      { meetingOutcomeStatus: MEETING_OUTCOME_HELD },
      { meetingOutcomeStatus: MEETING_OUTCOME_HELD },
    ]);
    expect(c.kr).toBe(3 * 300);
  });

  it("genbook-udfald tæller stadig som provisionsgivende møde", () => {
    const c = commissionKrForBookedDay([
      { meetingOutcomeStatus: MEETING_OUTCOME_REBOOK },
      { meetingOutcomeStatus: MEETING_OUTCOME_CANCELLED },
    ]);
    expect(c.heldCount).toBe(1);
    expect(c.cancelledCount).toBe(1);
    expect(c.kr).toBe(rateKrPerHeldMeeting(1));
  });
});

describe("forventetProvisionKrForBookedDay", () => {
  it("blander genbooking og standard i forventet", () => {
    const kr = forventetProvisionKrForBookedDay([
      { meetingOutcomeStatus: MEETING_OUTCOME_PENDING, bookedFromRebookingCampaign: true },
      { meetingOutcomeStatus: MEETING_OUTCOME_PENDING, bookedFromRebookingCampaign: false },
      { meetingOutcomeStatus: MEETING_OUTCOME_CANCELLED },
    ]);
    expect(kr).toBe(COMMISSION_REBOOKING_FLAT_KR + rateKrPerHeldMeeting(1));
  });
});
