import { describe, expect, it } from "vitest";
import { dedupeLeadVisits } from "@/lib/lead-visit-dedupe";

function visit(at: string, userId = "u1", leadId = "l1") {
  return { visitedAt: new Date(at), userId, leadId };
}

describe("dedupeLeadVisits", () => {
  it("keeps only one visit when three opens are within 5 minutes", () => {
    const result = dedupeLeadVisits([
      visit("2026-07-10T16:13:00"),
      visit("2026-07-10T16:15:00"),
      visit("2026-07-10T16:16:00"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.visitedAt.toISOString()).toBe(new Date("2026-07-10T16:13:00").toISOString());
  });

  it("keeps two visits when opens are 7 minutes apart", () => {
    const result = dedupeLeadVisits([
      visit("2026-07-10T10:00:00"),
      visit("2026-07-10T10:07:00"),
    ]);
    expect(result).toHaveLength(2);
  });

  it("dedupes per user and lead independently", () => {
    const result = dedupeLeadVisits([
      visit("2026-07-10T13:07:00", "u1", "l1"),
      visit("2026-07-10T13:08:00", "u1", "l1"),
      visit("2026-07-10T16:13:00", "u1", "l1"),
      visit("2026-07-10T16:15:00", "u2", "l1"),
      visit("2026-07-10T16:16:00", "u2", "l1"),
    ]);
    expect(result).toHaveLength(3);
  });
});
