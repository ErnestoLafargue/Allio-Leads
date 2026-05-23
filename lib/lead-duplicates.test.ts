import { describe, expect, it } from "vitest";
import {
  buildDuplicateGroups,
  filterDuplicateGroupsByCampaigns,
  type DuplicateGroup,
} from "./lead-duplicates";

const base = {
  companyName: "Test ApS",
  status: "NEW",
  importedAt: "2026-01-01T00:00:00.000Z",
  lastOutcomeAt: null,
  campaign: { id: "camp-a", name: "Kampagne A" },
};

describe("buildDuplicateGroups", () => {
  it("grupperer på samme CVR", () => {
    const r = buildDuplicateGroups([
      {
        id: "a",
        ...base,
        cvr: "12345678",
        phone: "11111111",
        campaign: { id: "c1", name: "A" },
      },
      {
        id: "b",
        ...base,
        cvr: "12345678",
        phone: "22222222",
        campaign: { id: "c2", name: "B" },
      },
    ]);
    expect(r.groupCount).toBe(1);
    expect(r.duplicateLeadCount).toBe(2);
    expect(r.groups[0].matchKind).toBe("cvr");
    expect(r.groups[0].matchLabel).toContain("12345678");
  });

  it("grupperer på samme telefon", () => {
    const r = buildDuplicateGroups([
      { id: "a", ...base, cvr: "", phone: "+45 22 33 44 55", companyName: "Auto ApS" },
      { id: "b", ...base, cvr: "", phone: "22334455", companyName: "Auto ApS 2" },
    ]);
    expect(r.groupCount).toBe(1);
    expect(r.groups[0].matchKind).toBe("phone");
  });

  it("forener transitivt via union-find", () => {
    const r = buildDuplicateGroups([
      { id: "a", ...base, cvr: "87654321", phone: "11111111" },
      { id: "b", ...base, cvr: "87654321", phone: "22222222" },
      { id: "c", ...base, cvr: "11111111", phone: "22222222" },
    ]);
    expect(r.groupCount).toBe(1);
    expect(r.groups[0].leads).toHaveLength(3);
  });

  it("inkluderer domæne fra customFields", () => {
    const r = buildDuplicateGroups([
      {
        id: "a",
        ...base,
        cvr: "12345678",
        phone: "11111111",
        customFields: JSON.stringify({ domaene: "example.dk" }),
      },
      {
        id: "b",
        ...base,
        cvr: "12345678",
        phone: "22222222",
        customFields: JSON.stringify({ domain: "other.com" }),
      },
    ]);
    expect(r.groups[0].leads[0].domain).toBe("example.dk");
    expect(r.groups[0].leads[1].domain).toBe("other.com");
  });

  it("mapper campaignId fra campaign-relation", () => {
    const r = buildDuplicateGroups([
      { id: "a", ...base, cvr: "12345678", phone: "11111111", campaign: { id: "cbit", name: "Cbit" } },
      { id: "b", ...base, cvr: "12345678", phone: "22222222", campaign: { id: "gecko", name: "Gecko" } },
    ]);
    expect(r.groups[0].leads[0].campaignId).toBe("cbit");
    expect(r.groups[0].leads[1].campaignId).toBe("gecko");
  });

  it("ignorerer leads uden match-nøgle", () => {
    const r = buildDuplicateGroups([
      { id: "a", ...base, cvr: "", phone: "" },
      { id: "b", ...base, cvr: "", phone: "22334455" },
    ]);
    expect(r.groupCount).toBe(0);
  });
});

function sampleGroup(): DuplicateGroup {
  return {
    id: "g1",
    matchKind: "phone",
    matchLabel: "Telefon: 45281173",
    leads: [
      {
        id: "a",
        companyName: "A",
        domain: "",
        cvr: "",
        phone: "45281173",
        status: "NEW",
        notes: "",
        importedAt: "2026-01-01T00:00:00.000Z",
        lastOutcomeAt: null,
        campaignId: "cbit",
        campaignName: "Cbit Booking",
      },
      {
        id: "b",
        companyName: "B",
        domain: "",
        cvr: "",
        phone: "45281173",
        status: "NEW",
        notes: "",
        importedAt: "2026-01-02T00:00:00.000Z",
        lastOutcomeAt: null,
        campaignId: "gecko",
        campaignName: "Gecko Booking",
      },
    ],
  };
}

describe("filterDuplicateGroupsByCampaigns", () => {
  const groups = [sampleGroup()];

  it("returnerer alle grupper uden filter", () => {
    expect(filterDuplicateGroupsByCampaigns(groups, new Set())).toHaveLength(1);
  });

  it("viser gruppe når mindst ét lead matcher valgt kampagne", () => {
    const filtered = filterDuplicateGroupsByCampaigns(groups, new Set(["cbit"]));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].leads).toHaveLength(2);
  });

  it("skjuler gruppe når ingen leads matcher", () => {
    expect(filterDuplicateGroupsByCampaigns(groups, new Set(["motor"]))).toHaveLength(0);
  });

  it("union ved flere valgte kampagner", () => {
    expect(filterDuplicateGroupsByCampaigns(groups, new Set(["cbit", "gecko"]))).toHaveLength(1);
    expect(filterDuplicateGroupsByCampaigns(groups, new Set(["gecko"]))).toHaveLength(1);
  });
});
