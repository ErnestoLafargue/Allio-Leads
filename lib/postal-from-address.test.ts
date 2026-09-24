import { describe, expect, it } from "vitest";
import {
  effectivePostalCode,
  extractDanishPostalFromAddress,
} from "./postal-from-address";

describe("extractDanishPostalFromAddress", () => {
  it("parser standard dansk adresse med komma", () => {
    expect(extractDanishPostalFromAddress("Larsbjørnsstræde 11, 1454 København K")).toEqual({
      postalCode: "1454",
      city: "København K",
    });
    expect(extractDanishPostalFromAddress("Stormgade 47, 6700 Esbjerg")).toEqual({
      postalCode: "6700",
      city: "Esbjerg",
    });
  });

  it("returnerer null for tom/uden postnr", () => {
    expect(extractDanishPostalFromAddress("")).toBeNull();
    expect(extractDanishPostalFromAddress("Kun gadenavn 12")).toBeNull();
  });

  it("tager postnr efter komma uden by", () => {
    expect(extractDanishPostalFromAddress("Gade 1, 2100")).toEqual({
      postalCode: "2100",
      city: "",
    });
  });
});

describe("effectivePostalCode", () => {
  it("foretrækker gemt postalCode", () => {
    expect(effectivePostalCode("8000", "Gade 1, 2100 København")).toBe("8000");
  });

  it("falder tilbage til adresse", () => {
    expect(effectivePostalCode("", "Gade 1, 2100 København Ø")).toBe("2100");
    expect(effectivePostalCode("  ", "Nørrevænget 51, 6933 Kibæk")).toBe("6933");
  });
});
