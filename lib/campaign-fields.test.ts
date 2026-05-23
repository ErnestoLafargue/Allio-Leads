import { describe, expect, it } from "vitest";
import {
  FIXED_DOMAIN_EXTENSION_FIELD,
  mergeDefaultExtensions,
  parseFieldConfig,
  serializeFieldConfig,
} from "./campaign-fields";

describe("mergeDefaultExtensions — Domæne", () => {
  it("tilføjer domaene som sidste felt under companyName på tom config", () => {
    const cfg = mergeDefaultExtensions({ extensions: {} });
    const names = cfg.extensions.companyName?.map((f) => f.key) ?? [];
    expect(names).toEqual(["stifter", "direktor", "fuldt_ansvarlig_person", "domaene"]);
    expect(cfg.extensions.companyName?.at(-1)).toEqual(FIXED_DOMAIN_EXTENSION_FIELD);
  });

  it("fjerner duplikat Domæne fra gemt config og beholder standard domaene", () => {
    const raw = serializeFieldConfig({
      extensions: {
        companyName: [
          { key: "stifter", label: "Stifter" },
          { key: "Domæne", label: "Domæne" },
          { key: "hjemmeside", label: "Hjemmeside" },
        ],
      },
    });
    const cfg = parseFieldConfig(raw);
    const keys = cfg.extensions.companyName?.map((f) => f.key) ?? [];
    expect(keys).toEqual([
      "stifter",
      "direktor",
      "fuldt_ansvarlig_person",
      "domaene",
      "hjemmeside",
    ]);
  });
});
