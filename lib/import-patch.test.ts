import { describe, expect, it } from "vitest";
import {
  buildImportPatchForLead,
  getIncomingMatchValue,
  getLeadMatchValue,
  indexLeadsForPatchMatch,
  mergeFieldCounts,
  parseImportPatchFields,
  parseImportPatchMatchField,
  resolveIncomingDomain,
} from "./import-patch";

describe("parseImportPatchFields", () => {
  it("accepterer kun kendte felter", () => {
    expect(parseImportPatchFields(["email", "domain", "bogus", "virksomhedstype"])).toEqual([
      "email",
      "domain",
      "virksomhedstype",
    ]);
    expect(parseImportPatchFields("email")).toBeNull();
  });
});

describe("parseImportPatchMatchField", () => {
  it("default er cvr", () => {
    expect(parseImportPatchMatchField(undefined)).toBe("cvr");
    expect(parseImportPatchMatchField("phone")).toBe("phone");
    expect(parseImportPatchMatchField("domain")).toBe("domain");
  });
});

describe("resolveIncomingDomain", () => {
  it("foretrækker mappet domæne", () => {
    expect(resolveIncomingDomain({ domaene: "example.dk" }, "a@other.dk")).toBe("example.dk");
  });

  it("bruger extras fra standard-mapping før e-mail", () => {
    expect(resolveIncomingDomain({}, "a@other.dk", ["https://www.firma.dk"])).toBe(
      "https://www.firma.dk",
    );
  });

  it("falder tilbage til e-mail-host", () => {
    expect(resolveIncomingDomain({}, "kontakt@firma.dk")).toBe("firma.dk");
  });
});

describe("match keys", () => {
  it("normaliserer CVR, telefon, e-mail og domæne", () => {
    expect(getIncomingMatchValue({ cvr: "DK 12 34 56 78", phone: "", email: "", domain: "" }, "cvr")).toBe(
      "12345678",
    );
    expect(
      getIncomingMatchValue({ cvr: "", phone: "+45 12 34 56 78", email: "", domain: "" }, "phone"),
    ).toBe("+4512345678");
    expect(
      getIncomingMatchValue({ cvr: "", phone: "", email: "A@Firma.DK", domain: "" }, "email"),
    ).toBe("a@firma.dk");
    expect(
      getIncomingMatchValue(
        { cvr: "", phone: "", email: "", domain: "https://www.firma.dk/path" },
        "domain",
      ),
    ).toBe("firma.dk");
  });

  it("indekserer leads inden for kampagne eller alle", () => {
    const leads = [
      {
        id: "a",
        campaignId: "c1",
        cvr: "12345678",
        phone: "11111111",
        email: "",
        customFields: "{}",
      },
      {
        id: "b",
        campaignId: "c2",
        cvr: "12345678",
        phone: "22222222",
        email: "",
        customFields: "{}",
      },
    ];
    const inCampaign = indexLeadsForPatchMatch({
      leads,
      matchField: "cvr",
      campaignId: "c1",
      allCampaigns: false,
    });
    expect(inCampaign.get("12345678")).toEqual(["a"]);
    const all = indexLeadsForPatchMatch({
      leads,
      matchField: "cvr",
      campaignId: "c1",
      allCampaigns: true,
    });
    expect(all.get("12345678")).toEqual(["a", "b"]);
  });

  it("matcher lead på domæne i customFields", () => {
    expect(
      getLeadMatchValue(
        {
          id: "1",
          campaignId: "c1",
          cvr: "",
          phone: "",
          email: "",
          customFields: JSON.stringify({ domaene: "https://WWW.Firma.dk/" }),
        },
        "domain",
      ),
    ).toBe("firma.dk");
  });

  it("matcher også ældre nøgle domæne (med æ)", () => {
    expect(
      getLeadMatchValue(
        {
          id: "1",
          campaignId: "c1",
          cvr: "",
          phone: "",
          email: "",
          customFields: JSON.stringify({ domæne: "illum.dk" }),
        },
        "domain",
      ),
    ).toBe("illum.dk");
  });
});

describe("buildImportPatchForLead", () => {
  const emptyLead = {
    id: "1",
    phone: "",
    email: "",
    customFields: "{}",
  };

  it("udfilder kun valgte tomme felter", () => {
    const { patch, fieldCounts } = buildImportPatchForLead({
      lead: emptyLead,
      incoming: {
        phone: "12345678",
        email: "a@firma.dk",
        domain: "firma.dk",
        custom: { virksomhedstype: "ApS", ekstra: "x" },
      },
      patchFields: ["email", "virksomhedstype"],
    });
    expect(patch.email).toBe("a@firma.dk");
    expect(patch.phone).toBeUndefined();
    expect(fieldCounts).toEqual({ email: 1, virksomhedstype: 1 });
    const custom = JSON.parse(String(patch.customFields));
    expect(custom.virksomhedstype).toBe("ApS");
    expect(custom.ekstra).toBeUndefined();
  });

  it("overskriver aldrig allerede udfyldte felter", () => {
    const { patch, fieldCounts } = buildImportPatchForLead({
      lead: {
        id: "1",
        phone: "111",
        email: "old@firma.dk",
        customFields: JSON.stringify({ virksomhedstype: "A/S", domaene: "old.dk" }),
      },
      incoming: {
        phone: "222",
        email: "new@firma.dk",
        domain: "new.dk",
        custom: { virksomhedstype: "ApS" },
      },
      patchFields: ["phone", "email", "domain", "virksomhedstype"],
    });
    expect(patch).toEqual({});
    expect(fieldCounts).toEqual({});
  });

  it("otherCustom springer over domæne og virksomhedstype", () => {
    const { patch, fieldCounts } = buildImportPatchForLead({
      lead: emptyLead,
      incoming: {
        phone: "",
        email: "",
        domain: "x.dk",
        custom: {
          virksomhedstype: "ApS",
          domaene: "x.dk",
          branchebeskrivelse: "Maler",
        },
      },
      patchFields: ["otherCustom"],
    });
    const custom = JSON.parse(String(patch.customFields));
    expect(custom.branchebeskrivelse).toBe("Maler");
    expect(custom.virksomhedstype).toBeUndefined();
    expect(custom.domaene).toBeUndefined();
    expect(fieldCounts).toEqual({ otherCustom: 1 });
  });
});

describe("mergeFieldCounts", () => {
  it("summerer tællere", () => {
    const target = { email: 2 };
    mergeFieldCounts(target, { email: 1, virksomhedstype: 3 });
    expect(target).toEqual({ email: 3, virksomhedstype: 3 });
  });
});
