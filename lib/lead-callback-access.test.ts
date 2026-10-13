import { describe, expect, it } from "vitest";
import { isCallbackWorkLead } from "./lead-callback-access";

describe("isCallbackWorkLead", () => {
  it("kender planlagt genopkald uanset formular-udfald", () => {
    expect(isCallbackWorkLead({ status: "CALLBACK_SCHEDULED" })).toBe(true);
    expect(isCallbackWorkLead({ status: " callback_scheduled " })).toBe(true);
    expect(isCallbackWorkLead({ status: "NEW" })).toBe(false);
    expect(isCallbackWorkLead({ status: "VOICEMAIL" })).toBe(false);
    expect(isCallbackWorkLead(null)).toBe(false);
  });
});
