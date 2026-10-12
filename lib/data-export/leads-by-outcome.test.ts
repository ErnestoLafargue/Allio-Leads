import { describe, expect, it } from "vitest";
import {
  buildOutcomeExportWhere,
  isExportableOutcomeStatus,
  mapLeadToOutcomeExportRow,
  OUTCOME_EXPORT_HEADERS,
  parseCampaignIds,
  parseExportStatuses,
} from "./leads-by-outcome";

describe("parseExportStatuses", () => {
  it("kræver mindst ét udfald", () => {
    expect(parseExportStatuses(null)).toEqual({ error: expect.any(String) });
    expect(parseExportStatuses("")).toEqual({ error: expect.any(String) });
  });

  it("accepterer de tre whitelistede statusser", () => {
    expect(parseExportStatuses("MEETING_BOOKED")).toEqual({
      statuses: ["MEETING_BOOKED"],
    });
    expect(parseExportStatuses("NOT_INTERESTED,UNQUALIFIED")).toEqual({
      statuses: ["NOT_INTERESTED", "UNQUALIFIED"],
    });
  });

  it("afviser soft / andre udfald", () => {
    const r = parseExportStatuses("VOICEMAIL");
    expect("error" in r).toBe(true);
    expect(parseExportStatuses("NEW")).toEqual({ error: expect.any(String) });
    expect(parseExportStatuses("MEETING_BOOKED,CALLBACK_SCHEDULED")).toEqual({
      error: expect.any(String),
    });
  });

  it("deduplikerer", () => {
    expect(parseExportStatuses("MEETING_BOOKED,meeting_booked")).toEqual({
      statuses: ["MEETING_BOOKED"],
    });
  });
});

describe("isExportableOutcomeStatus", () => {
  it("kun de tre", () => {
    expect(isExportableOutcomeStatus("MEETING_BOOKED")).toBe(true);
    expect(isExportableOutcomeStatus("VOICEMAIL")).toBe(false);
  });
});

describe("buildOutcomeExportWhere", () => {
  it("filtrerer kun på valgte statusser", () => {
    expect(buildOutcomeExportWhere({ statuses: ["MEETING_BOOKED"] })).toEqual({
      status: { in: ["MEETING_BOOKED"] },
    });
  });

  it("snævrer med kampagne", () => {
    expect(
      buildOutcomeExportWhere({
        statuses: ["NOT_INTERESTED"],
        campaignIds: ["c1", "c2"],
      }),
    ).toEqual({
      status: { in: ["NOT_INTERESTED"] },
      campaignId: { in: ["c1", "c2"] },
    });
  });
});

describe("parseCampaignIds", () => {
  it("parser og deduplikerer", () => {
    expect(parseCampaignIds("a,b,a")).toEqual(["a", "b"]);
    expect(parseCampaignIds(null)).toEqual([]);
  });
});

describe("mapLeadToOutcomeExportRow", () => {
  it("inkluder mødeudfald og noter", () => {
    const row = mapLeadToOutcomeExportRow({
      id: "lead1",
      campaignId: "c1",
      companyName: "Test ApS",
      phone: "123",
      privatePhone: null,
      email: "a@b.dk",
      cvr: "12345678",
      address: "Vej 1",
      postalCode: "2100",
      city: "København",
      industry: "",
      notes: "Vigtige mødenoter her",
      customFields: JSON.stringify({
        fuldt_ansvarlig_person: "Anna",
        stifter: "Bo",
      }),
      status: "MEETING_BOOKED",
      meetingOutcomeStatus: "SALE",
      meetingBookedAt: new Date("2026-01-01T10:00:00Z"),
      meetingScheduledFor: new Date("2026-01-05T10:00:00Z"),
      meetingContactName: "Kontakt",
      meetingContactEmail: "k@x.dk",
      meetingContactPhonePrivate: "999",
      lastOutcomeAt: new Date("2026-01-01T10:00:00Z"),
      campaign: { name: "Cbit" },
      bookedByUser: { name: "Sælger", username: "saelger" },
      assignedUser: { name: "Victor", username: "victor" },
      outcomeLogs: [
        {
          createdAt: new Date("2026-01-01T10:00:00Z"),
          status: "MEETING_BOOKED",
          user: { name: "Sælger", username: "saelger" },
        },
      ],
    } as unknown as Parameters<typeof mapLeadToOutcomeExportRow>[0]);

    expect(row.Kampagne).toBe("Cbit");
    expect(row.Udfald).toBe("Møde booket");
    expect(row.Mødeudfald).toBe("Salg");
    expect(row.Noter).toBe("Vigtige mødenoter her");
    expect(row.CVR).toBe("12345678");
    expect(row["Fuldt ansvarlig deltager"]).toBe("Anna");
    expect(row["Udfald sat af"]).toBe("Sælger");
    expect(row.Mødeansvarlig).toBe("Victor");
    for (const h of OUTCOME_EXPORT_HEADERS) {
      expect(row).toHaveProperty(h);
    }
  });
});
