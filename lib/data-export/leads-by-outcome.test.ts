import { describe, expect, it } from "vitest";
import {
  buildOutcomeExportWhere,
  isExportableOutcomeStatus,
  mapLeadToOutcomeExportRow,
  OUTCOME_EXPORT_HEADERS,
  parseCampaignIds,
  parseExportStatuses,
  resolveBookedFromCampaignId,
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
  });

  it("afviser soft / andre udfald", () => {
    expect("error" in parseExportStatuses("VOICEMAIL")).toBe(true);
  });
});

describe("isExportableOutcomeStatus", () => {
  it("kun de tre", () => {
    expect(isExportableOutcomeStatus("MEETING_BOOKED")).toBe(true);
    expect(isExportableOutcomeStatus("VOICEMAIL")).toBe(false);
  });
});

describe("buildOutcomeExportWhere", () => {
  it("matcher historisk outcome-log — ikke nuværende status", () => {
    expect(buildOutcomeExportWhere({ statuses: ["MEETING_BOOKED"] })).toEqual({
      outcomeLogs: { some: { status: { in: ["MEETING_BOOKED"] } } },
    });
  });

  it("ignoreres kampagne i SQL når møde booket (filtreres via booket-fra)", () => {
    expect(
      buildOutcomeExportWhere({
        statuses: ["MEETING_BOOKED"],
        campaignIds: ["gecko"],
      }),
    ).toEqual({
      outcomeLogs: { some: { status: { in: ["MEETING_BOOKED"] } } },
    });
  });

  it("snævrer med kampagne for ikke-møde-udfald", () => {
    expect(
      buildOutcomeExportWhere({
        statuses: ["NOT_INTERESTED"],
        campaignIds: ["c1", "c2"],
      }),
    ).toEqual({
      outcomeLogs: { some: { status: { in: ["NOT_INTERESTED"] } } },
      OR: [
        { campaignId: { in: ["c1", "c2"] } },
        { visitHistory: { some: { campaignId: { in: ["c1", "c2"] } } } },
      ],
    });
  });
});

describe("resolveBookedFromCampaignId", () => {
  it("foretrækker kildekampagne før systemkampagne ved booking", () => {
    const systemIds = new Set(["upcoming"]);
    const visits = [
      {
        leadId: "l1",
        campaignId: "gecko",
        visitedAt: new Date("2026-01-01T10:00:00Z"),
      },
      {
        leadId: "l1",
        campaignId: "upcoming",
        visitedAt: new Date("2026-01-01T12:00:00Z"),
      },
    ];
    expect(
      resolveBookedFromCampaignId(
        visits,
        "l1",
        new Date("2026-01-01T11:00:00Z"),
        systemIds,
      ),
    ).toBe("gecko");
    // Selv hvis booking-tid er efter flyt til kommende møder: sidste ikke-system før tidspunkt
    expect(
      resolveBookedFromCampaignId(
        visits,
        "l1",
        new Date("2026-01-01T13:00:00Z"),
        systemIds,
      ),
    ).toBe("gecko");
  });
});

describe("parseCampaignIds", () => {
  it("parser og deduplikerer", () => {
    expect(parseCampaignIds("a,b,a")).toEqual(["a", "b"]);
  });
});

describe("mapLeadToOutcomeExportRow", () => {
  it("viser kampagne booket fra", () => {
    const row = mapLeadToOutcomeExportRow(
      {
        id: "lead1",
        campaignId: "upcoming",
        companyName: "Test ApS",
        phone: "123",
        privatePhone: null,
        email: "a@b.dk",
        cvr: "12345678",
        address: "Vej 1",
        postalCode: "2100",
        city: "København",
        industry: "",
        notes: "noter",
        customFields: "{}",
        status: "MEETING_BOOKED",
        meetingOutcomeStatus: "PENDING",
        meetingBookedAt: new Date("2026-01-01T10:00:00Z"),
        meetingScheduledFor: new Date("2026-01-05T10:00:00Z"),
        meetingContactName: "Kontakt",
        meetingContactEmail: "k@x.dk",
        meetingContactPhonePrivate: "999",
        lastOutcomeAt: new Date("2026-01-01T10:00:00Z"),
        campaign: { name: "Kommende møder" },
        bookedByUser: { name: "Sælger", username: "saelger" },
        assignedUser: { name: "Victor", username: "victor" },
        outcomeLogs: [
          {
            createdAt: new Date("2026-01-01T10:00:00Z"),
            status: "MEETING_BOOKED",
            user: { name: "Sælger", username: "saelger" },
          },
        ],
        visitHistory: [],
        bookedFromCampaignId: "gecko",
        bookedFromCampaignName: "Gecko Booking",
      } as unknown as Parameters<typeof mapLeadToOutcomeExportRow>[0],
      ["MEETING_BOOKED"],
    );

    expect(row["Kampagne (booket fra)"]).toBe("Gecko Booking");
    expect(row["Kampagne (nuværende)"]).toBe("Kommende møder");
    for (const h of OUTCOME_EXPORT_HEADERS) {
      expect(row).toHaveProperty(h);
    }
  });
});
