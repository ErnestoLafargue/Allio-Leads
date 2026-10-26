import { describe, expect, it } from "vitest";
import { canScheduleCallbackFromLead } from "@/lib/lead-callback-schedule";

describe("canScheduleCallbackFromLead", () => {
  it("tillader Ny og almindelige udfald (fx rettelse fra historik)", () => {
    expect(canScheduleCallbackFromLead({ status: "NEW" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "VOICEMAIL" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "NOT_HOME" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "NOT_INTERESTED" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "UNQUALIFIED" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "DELETED" })).toBe(true);
  });

  it("tillader at flytte et ventende tilbagekald", () => {
    expect(
      canScheduleCallbackFromLead({ status: "CALLBACK_SCHEDULED", callbackStatus: "PENDING" }),
    ).toBe(true);
  });

  it("blokerer afsluttede tilbagekald og aktive/afventende møder", () => {
    expect(
      canScheduleCallbackFromLead({ status: "CALLBACK_SCHEDULED", callbackStatus: "DONE" }),
    ).toBe(false);
    expect(canScheduleCallbackFromLead({ status: "MEETING_BOOKED" })).toBe(false);
    expect(
      canScheduleCallbackFromLead({
        status: "MEETING_BOOKED",
        meetingOutcomeStatus: "PENDING",
      }),
    ).toBe(false);
    expect(
      canScheduleCallbackFromLead({
        status: "MEETING_BOOKED",
        meetingOutcomeStatus: "IN_PROGRESS",
      }),
    ).toBe(false);
  });

  it("tillader tilbagekald på genbook/afholdt/ej mødt m.m. — samme overalt", () => {
    for (const meetingOutcomeStatus of ["REBOOK", "HELD", "CANCELLED", "LOST", "SALE"]) {
      expect(
        canScheduleCallbackFromLead({
          status: "MEETING_BOOKED",
          meetingOutcomeStatus,
        }),
      ).toBe(true);
    }
  });
});
