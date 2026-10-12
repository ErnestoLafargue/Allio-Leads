import { describe, expect, it } from "vitest";
import { canScheduleCallbackFromLead } from "@/lib/lead-callback-schedule";

describe("canScheduleCallbackFromLead", () => {
  it("tillader Ny og almindelige udfald (fx rettelse fra historik)", () => {
    expect(canScheduleCallbackFromLead({ status: "NEW" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "VOICEMAIL" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "NOT_HOME" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "NOT_INTERESTED" })).toBe(true);
    expect(canScheduleCallbackFromLead({ status: "UNQUALIFIED" })).toBe(true);
  });

  it("tillader at flytte et ventende tilbagekald", () => {
    expect(
      canScheduleCallbackFromLead({ status: "CALLBACK_SCHEDULED", callbackStatus: "PENDING" }),
    ).toBe(true);
  });

  it("blokerer afsluttede tilbagekald og møde booket", () => {
    expect(
      canScheduleCallbackFromLead({ status: "CALLBACK_SCHEDULED", callbackStatus: "DONE" }),
    ).toBe(false);
    expect(canScheduleCallbackFromLead({ status: "MEETING_BOOKED" })).toBe(false);
  });
});
