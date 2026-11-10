import { describe, expect, it } from "vitest";
import {
  isCallbackReservedForOtherUser,
  isCallbackWorkLead,
  keepsCallbackOnSave,
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

describe("isCallbackReservedForOtherUser (automatisk udlevering)", () => {
  it("ejeren får sit eget tilbagekald", () => {
    expect(isCallbackReservedForOtherUser("user-a", callbackForA)).toBe(false);
  });

  it("en anden sælger afvises", () => {
    expect(isCallbackReservedForOtherUser("user-b", callbackForA)).toBe(true);
  });

  it("tilbagekald uden tildelt (slettet bruger) udleveres ikke automatisk til nogen", () => {
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

describe("keepsCallbackOnSave", () => {
  it("en anden, der gemmer med «Ny», fjerner ikke ejerens tilbagekald", () => {
    expect(keepsCallbackOnSave("user-b", callbackForA, "NEW")).toBe(true);
  });

  it("et rigtigt udfald afslutter tilbagekaldet — også fra en anden", () => {
    for (const status of ["VOICEMAIL", "NOT_HOME", "NOT_INTERESTED", "MEETING_BOOKED"]) {
      expect(keepsCallbackOnSave("user-b", callbackForA, status)).toBe(false);
    }
  });

  it("ejeren kan selv afslutte med «Ny» som før", () => {
    expect(keepsCallbackOnSave("user-a", callbackForA, "NEW")).toBe(false);
  });

  it("gælder kun leads med aktivt tilbagekald", () => {
    expect(keepsCallbackOnSave("user-b", { status: "VOICEMAIL", callbackReservedByUserId: null }, "NEW")).toBe(
      false,
    );
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
