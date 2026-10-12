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
    expect("error" in parseExportStatuses("VOICEMAIL")).toBe(true);
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
  it("matcher historisk outcome-log — ikke nuværende status", () => {
    expect(buildOutcomeExportWhere({ statuses: ["MEETING_BOOKED"] })).toEqual({
      outcomeLogs: { some: { status: { in: ["MEETING_BOOKED"] } } },
    });
  });

  it("snævrer med kampagne via nuværende ELLER visit-historik", () => {
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

  it("dato filtrerer på outcome-log createdAt", () => {
    const where = buildOutcomeExportWhere({
      statuses: ["MEETING_BOOKED"],
      from: "2026-01-01",
      to: "2026-10-12",
    });
    expect(where.outcomeLogs).toEqual({
      some: {
        status: { in: ["MEETING_BOOKED"] },
        createdAt: {
          gte: expect.any(Date),
          lte: expect.any(Date),
        },
      },
    });
    expect(where).not.toHaveProperty("lastOutcomeAt");
    expect(where).not.toHaveProperty("status");
  });
});

describe("parseCampaignIds", () => {
  it("parser og deduplikerer", () => {
    expect(parseCampaignIds("a,b,a")).toEqual(["a", "b"]);
    expect(parseCampaignIds(null)).toEqual([]);
  });
});

describe("mapLeadToOutcomeExportRow", () => {
  it("viser historisk møde booket selv når nuværende status er ikke interesseret", () => {
    const row = mapLeadToOutcomeExportRow(
      {
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
        status: "NOT_INTERESTED",
        meetingOutcomeStatus: "LOST",
        meetingBookedAt: new Date("2026-01-01T10:00:00Z"),
        meetingScheduledFor: new Date("2026-01-05T10:00:00Z"),
        meetingContactName: "Kontakt",
        meetingContactEmail: "k@x.dk",
        meetingContactPhonePrivate: "999",
        lastOutcomeAt: new Date("2026-02-01T10:00:00Z"),
        campaign: { name: "Genbooking" },
        bookedByUser: { name: "Sælger", username: "saelger" },
        assignedUser: { name: "Victor", username: "victor" },
        outcomeLogs: [
          {
            createdAt: new Date("2026-02-01T10:00:00Z"),
            status: "NOT_INTERESTED",
            user: { name: "Anden", username: "anden" },
          },
          {
            createdAt: new Date("2026-01-01T10:00:00Z"),
            status: "MEETING_BOOKED",
            user: { name: "Sælger", username: "saelger" },
          },
        ],
      } as unknown as Parameters<typeof mapLeadToOutcomeExportRow>[0],
      ["MEETING_BOOKED"],
    );

    expect(row["Historisk udfald"]).toBe("Møde booket");
    expect(row["Nuværende udfald"]).toBe("Ikke interesseret");
    expect(row.Mødeudfald).toBe("Tabt");
    expect(row.Noter).toBe("Vigtige mødenoter her");
    expect(row.CVR).toBe("12345678");
    expect(row["Historisk udfald sat af"]).toBe("Sælger");
    expect(row["Kampagne (nuværende)"]).toBe("Genbooking");
    for (const h of OUTCOME_EXPORT_HEADERS) {
      expect(row).toHaveProperty(h);
    }
  });
});
