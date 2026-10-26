import { describe, expect, it } from "vitest";
import { applyColumnMapping, pickBaseFromNorm, suggestColumnMapping } from "../lib/import-mapping";

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

describe("suggestColumnMapping bookingsystem", () => {
  it("gætter Bookingsystem-kolonner før virksomhedsnavn", () => {
    const m = suggestColumnMapping(["Bookingsystem", "Booking system", "booking_system", "Virksomhedsnavn"]);
    expect(m["Bookingsystem"]).toBe("bookingSystem");
    expect(m["Booking system"]).toBe("bookingSystem");
    expect(m["booking_system"]).toBe("bookingSystem");
    expect(m["Virksomhedsnavn"]).toBe("companyName");
  });

  it("mapper værdien til leadets bookingSystem", () => {
    const n = applyColumnMapping({ Firma: "Klinik ApS", BS: "Planway" }, { Firma: "companyName", BS: "bookingSystem" });
    expect(pickBaseFromNorm(n).bookingSystem).toBe("Planway");
  });
});
