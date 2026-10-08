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
