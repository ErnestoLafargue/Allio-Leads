import { describe, expect, it } from "vitest";
import { buildIndustryFilterLabelMap, extractIndustryCode, formatIndustryFilterLabel } from "./industry-display";

describe("extractIndustryCode", () => {
  it("parser 6-cifret kode", () => {
    expect(extractIndustryCode("031100")).toBe("031100");
  });

  it("parser punktform", () => {
    expect(extractIndustryCode("03.11.00")).toBe("031100");
  });
});

describe("formatIndustryFilterLabel", () => {
  const dict = {
    "031100": "Havfiskeri",
    "962300": "Drift af dagspa, saunaer og dampbade",
  };

  it("viser kode og beskrivelse", () => {
    expect(formatIndustryFilterLabel("031100", dict)).toBe("031100 — Havfiskeri");
  });

  it("bevarer ukendt kode uændret", () => {
    expect(formatIndustryFilterLabel("999999", dict)).toBe("999999");
  });

  it("bevarer allerede formateret værdi", () => {
    expect(formatIndustryFilterLabel("031100 — Eksisterende tekst", dict)).toBe("031100 — Eksisterende tekst");
  });
});

describe("buildIndustryFilterLabelMap", () => {
  it("bygger et label pr. rå værdi", () => {
    const map = buildIndustryFilterLabelMap(["031100", "999999"], { "031100": "Havfiskeri" });
    expect(map.get("031100")).toBe("031100 — Havfiskeri");
    expect(map.get("999999")).toBe("999999");
  });
});
