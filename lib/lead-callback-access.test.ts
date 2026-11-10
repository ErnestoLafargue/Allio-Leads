import { describe, expect, it } from "vitest";
import {
  callbackReservedForOtherUserMessage,
  canAccessCallbackLead,
  isCallbackReservedForOtherUser,
  isCallbackWorkLead,
  notCallbackReservedForOtherUserWhere,
} from "./lead-callback-access";
import { makeLead, matchesWhere } from "./test-helpers/in-memory-lead-db";

describe("isCallbackWorkLead", () => {
  it("kender planlagt genopkald uanset formular-udfald", () => {
    expect(isCallbackWorkLead({ status: "CALLBACK_SCHEDULED" })).toBe(true);
    expect(isCallbackWorkLead({ status: " callback_scheduled " })).toBe(true);
    expect(isCallbackWorkLead({ status: "NEW" })).toBe(false);
    expect(isCallbackWorkLead({ status: "VOICEMAIL" })).toBe(false);
    expect(isCallbackWorkLead(null)).toBe(false);
  });
});

const callbackForA = { status: "CALLBACK_SCHEDULED", callbackReservedByUserId: "user-a" };

describe("isCallbackReservedForOtherUser (dialeren)", () => {
  it("ejeren får sit eget tilbagekald", () => {
    expect(isCallbackReservedForOtherUser("user-a", callbackForA)).toBe(false);
  });

  it("en anden sælger afvises", () => {
    expect(isCallbackReservedForOtherUser("user-b", callbackForA)).toBe(true);
  });

  it("tilbagekald uden tildelt (slettet bruger) tilhører ingen i dialeren", () => {
    const orphan = { status: "CALLBACK_SCHEDULED", callbackReservedByUserId: null };
    expect(isCallbackReservedForOtherUser("user-a", orphan)).toBe(true);
  });

  it("låsen ophører, når udfaldet er flyttet væk fra tilbagekald", () => {
    for (const status of ["NEW", "VOICEMAIL", "NOT_HOME", "NOT_INTERESTED", "MEETING_BOOKED"]) {
      expect(isCallbackReservedForOtherUser("user-b", { status, callbackReservedByUserId: null })).toBe(
        false,
      );
    }
  });
});

describe("canAccessCallbackLead (lead-side og gem)", () => {
  it("admin-undtagelse: admin kan bevidst åbne en andens tilbagekald på lead-siden", () => {
    expect(canAccessCallbackLead("ADMIN", "admin-1", callbackForA)).toBe(true);
  });

  it("sælger kan kun åbne sit eget tilbagekald", () => {
    expect(canAccessCallbackLead("SELLER", "user-a", callbackForA)).toBe(true);
    expect(canAccessCallbackLead("SELLER", "user-b", callbackForA)).toBe(false);
  });
});

describe("notCallbackReservedForOtherUserWhere", () => {
  it("matcher samme rækker som isCallbackReservedForOtherUser", () => {
    const rows = [
      makeLead({ id: "cb-a", status: "CALLBACK_SCHEDULED", callbackReservedByUserId: "user-a" }),
      makeLead({ id: "cb-orphan", status: "CALLBACK_SCHEDULED", callbackReservedByUserId: null }),
      makeLead({ id: "new", status: "NEW" }),
      makeLead({ id: "vm", status: "VOICEMAIL" }),
    ];
    for (const userId of ["user-a", "user-b"]) {
      const where = notCallbackReservedForOtherUserWhere(userId) as Record<string, unknown>;
      for (const row of rows) {
        expect(matchesWhere(row, where), `${userId} / ${row.id}`).toBe(
          !isCallbackReservedForOtherUser(userId, row),
        );
      }
    }
  });
});

describe("callbackReservedForOtherUserMessage", () => {
  it("nævner ejeren ved navn og falder tilbage til «en anden sælger»", () => {
    expect(callbackReservedForOtherUserMessage("Hannibal")).toContain("hos Hannibal");
    expect(callbackReservedForOtherUserMessage(null)).toContain("hos en anden sælger");
    expect(callbackReservedForOtherUserMessage("  ")).toContain("hos en anden sælger");
  });
});
