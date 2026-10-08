import { describe, expect, it } from "vitest";
import { suggestColumnMapping } from "../lib/import-mapping";

describe("suggestColumnMapping virksomhedstype", () => {
  it("gætter Virksomhedstype før virksomhedsnavn", () => {
    const m = suggestColumnMapping(["Virksomhedstype", "company_type", "Virksomhed"]);
    expect(m["Virksomhedstype"]).toBe("custom:virksomhedstype");
    expect(m["company_type"]).toBe("custom:virksomhedstype");
    expect(m["Virksomhed"]).toBe("companyName");
  });
});

describe("suggestColumnMapping domæne", () => {
  it("gætter Domæne/domaene/website som domain", () => {
    const m = suggestColumnMapping(["Domæne", "Domaene", "Website", "Hjemmeside"]);
    expect(m["Domæne"]).toBe("domain");
    expect(m["Domaene"]).toBe("domain");
    expect(m["Website"]).toBe("domain");
    expect(m["Hjemmeside"]).toBe("domain");
  });
});
