import { describe, expect, it } from "vitest";
import { normalizePhone } from "./normalize-phone";

describe("normalizePhone", () => {
  it("normaliserer danske formater til 8 cifre", () => {
    expect(normalizePhone("22334455")).toBe("22334455");
    expect(normalizePhone("+4522334455")).toBe("22334455");
    expect(normalizePhone("+45 22 33 44 55")).toBe("22334455");
    expect(normalizePhone("45 22 33 44 55")).toBe("22334455");
    expect(normalizePhone("004522334455")).toBe("22334455");
    expect(normalizePhone("(22) 33-44-55")).toBe("22334455");
  });

  it("returnerer null for tom eller ugyldig", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});
