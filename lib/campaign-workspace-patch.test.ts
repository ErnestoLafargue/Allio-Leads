import { describe, expect, it } from "vitest";
import { buildCampaignLeadPatchBody } from "./campaign-workspace-patch";
import { isLockedByOtherUser } from "./lead-lock";

describe("buildCampaignLeadPatchBody", () => {
  const base = {
    companyName: "Test ApS",
    phone: "12 34 56 78",
    email: "t@test.dk",
    cvr: "12345678",
    address: "Vej 1",
    postalCode: "2100",
    city: "Kbh",
    industry: "IT",
    notes: "Note",
    customFields: { x: "y" },
    status: "NEW" as const,
    meetingScheduledFor: "",
    meetingContactName: "",
    meetingContactEmail: "",
    meetingContactPhonePrivate: "",
  };

  it("sender telefon og email korrekt (ikke byttet om)", () => {
    const body = buildCampaignLeadPatchBody(base);
    expect(body.phone).toBe("12 34 56 78");
    expect(body.email).toBe("t@test.dk");
  });

  it("tilføjer mødefelter når status er MEETING_BOOKED", () => {
    const body = buildCampaignLeadPatchBody(
      {
        ...base,
        status: "MEETING_BOOKED",
        meetingScheduledFor: "2026-05-01T10:00",
        meetingContactName: " Navn ",
        meetingContactEmail: " a@b.dk ",
        meetingContactPhonePrivate: " 12 ",
      },
      { meetingScheduledForISO: "2026-05-01T08:00:00.000Z" },
    );
    expect(body.status).toBe("MEETING_BOOKED");
    expect(body.meetingScheduledFor).toBe("2026-05-01T08:00:00.000Z");
    expect(body.meetingContactName).toBe("Navn");
    expect(body.meetingContactEmail).toBe("a@b.dk");
    expect(body.meetingContactPhonePrivate).toBe("12");
  });
});

/**
 * Spec: ved optimistisk «Gem og næste» kan samme bruger kort have to lås;
 * andre brugere må ikke se et lead som låst af en anden som «frit».
 */
describe("Gem & næste / dobbelt-lås (forventet adfærd)", () => {
  const now = new Date("2026-04-02T12:00:00.000Z");

  it("lead låst af u1 er «anden bruger» for u2", () => {
    const lead = { lockedByUserId: "u1", lockedAt: now, lockExpiresAt: null };
    expect(isLockedByOtherUser(lead, "u2", now)).toBe(true);
    expect(isLockedByOtherUser(lead, "u1", now)).toBe(false);
  });

  it("to forskellige leads låst af samme bruger: begge er låst for u2", () => {
    const a = { lockedByUserId: "u1", lockedAt: now, lockExpiresAt: null };
    const b = { lockedByUserId: "u1", lockedAt: now, lockExpiresAt: null };
    expect(isLockedByOtherUser(a, "u2", now)).toBe(true);
    expect(isLockedByOtherUser(b, "u2", now)).toBe(true);
  });
});
