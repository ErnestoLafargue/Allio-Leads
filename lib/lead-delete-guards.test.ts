import { describe, expect, it } from "vitest";
import { filterLeadIdsForBulkDelete } from "./lead-delete-guards";

describe("filterLeadIdsForBulkDelete", () => {
  const leads = [
    { id: "new-clean", status: "NEW", notes: null },
    { id: "new-notes", status: "NEW", notes: "Ring igen" },
    { id: "meeting", status: "MEETING_BOOKED", notes: null },
    { id: "not-interested", status: "NOT_INTERESTED", notes: null },
  ];

  it("sletter kun NEW uden noter når includeLeadsWithNotes er false", () => {
    const r = filterLeadIdsForBulkDelete(leads, leads.map((l) => l.id), {
      includeLeadsWithNotes: false,
    });
    expect(r.deletableIds).toEqual(["new-clean"]);
    expect(r.skipped).toEqual({
      meetingBooked: 1,
      hasOutcome: 1,
      hasNotes: 1,
    });
  });

  it("inkluderer NEW med noter når includeLeadsWithNotes er true", () => {
    const r = filterLeadIdsForBulkDelete(leads, leads.map((l) => l.id), {
      includeLeadsWithNotes: true,
    });
    expect(r.deletableIds).toEqual(["new-clean", "new-notes"]);
    expect(r.skipped.meetingBooked).toBe(1);
    expect(r.skipped.hasOutcome).toBe(1);
    expect(r.skipped.hasNotes).toBe(0);
  });

  it("blokerer altid MEETING_BOOKED", () => {
    const r = filterLeadIdsForBulkDelete(leads, ["meeting"], {
      includeLeadsWithNotes: true,
    });
    expect(r.deletableIds).toEqual([]);
    expect(r.skipped.meetingBooked).toBe(1);
  });

  it("ignorerer ids der ikke findes i leads-listen", () => {
    const r = filterLeadIdsForBulkDelete(leads, ["new-clean", "unknown"], {
      includeLeadsWithNotes: false,
    });
    expect(r.deletableIds).toEqual(["new-clean"]);
  });
});
