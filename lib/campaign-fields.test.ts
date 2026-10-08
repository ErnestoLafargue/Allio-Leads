import { describe, expect, it } from "vitest";
import {
  DEFAULT_INDUSTRY_EXTENSION_FIELDS,
  FIXED_DOMAIN_EXTENSION_FIELD,
  FIXED_EMAIL_ANNONCER_FIELDS,
  customFieldsHaveAnnoncerData,
  disableAnnoncerEmailFields,
  enableAnnoncerEmailFields,
  hasAnnoncerEmailFields,
  isFixedIndustryExtensionKey,
  mappingTargetsAnnoncerFields,
  mergeDefaultExtensions,
  parseFieldConfig,
  serializeFieldConfig,
} from "./campaign-fields";

describe("mergeDefaultExtensions — Domæne", () => {
  it("tilføjer domaene som sidste felt under companyName på tom config", () => {
    const cfg = mergeDefaultExtensions({ extensions: {} });
    const names = cfg.extensions.companyName?.map((f) => f.key) ?? [];
    expect(names).toEqual([
      "stifter",
      "direktor",
      "fuldt_ansvarlig_person",
      "hjemmeside_ansvarlig",
      "virksomhedsejer",
      "domaene",
    ]);
    expect(cfg.extensions.companyName?.at(-1)).toEqual(FIXED_DOMAIN_EXTENSION_FIELD);
  });

  it("holder Domæne sidst selv med ekstra kampagnefelter", () => {
    const cfg = mergeDefaultExtensions({
      extensions: {
        companyName: [
          { key: "stifter", label: "Stifter" },
          { key: "domaene", label: "Domæne" },
          { key: "ekstra_note", label: "Ekstra note" },
          { key: "hjemmeside", label: "Hjemmeside" },
        ],
      },
    });
    const keys = cfg.extensions.companyName?.map((f) => f.key) ?? [];
    expect(keys.at(-1)).toBe("domaene");
    expect(keys).toEqual([
      "stifter",
      "direktor",
      "fuldt_ansvarlig_person",
      "hjemmeside_ansvarlig",
      "virksomhedsejer",
      "ekstra_note",
      "hjemmeside",
      "domaene",
    ]);
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
      "hjemmeside_ansvarlig",
      "virksomhedsejer",
      "hjemmeside",
      "domaene",
    ]);
    expect(keys.at(-1)).toBe("domaene");
  });
});

describe("mergeDefaultExtensions — Virksomhedstype", () => {
  it("tilføjer virksomhedstype som første felt under industry på tom config", () => {
    const cfg = mergeDefaultExtensions({ extensions: {} });
    expect(cfg.extensions.industry).toEqual(DEFAULT_INDUSTRY_EXTENSION_FIELDS);
    expect(isFixedIndustryExtensionKey("virksomhedstype")).toBe(true);
  });

  it("bevarer øvrige industry-felter efter virksomhedstype", () => {
    const cfg = mergeDefaultExtensions({
      extensions: {
        industry: [
          { key: "virksomhedstype", label: "Virksomhedstype" },
          { key: "branchebeskrivelse", label: "Branchebeskrivelse" },
        ],
      },
    });
    expect(cfg.extensions.industry?.map((f) => f.key)).toEqual([
      "virksomhedstype",
      "branchebeskrivelse",
    ]);
  });

  it("parseFieldConfig merger virksomhedstype ind selv uden gemt industry-config", () => {
    const cfg = parseFieldConfig("{}");
    expect(cfg.extensions.industry?.[0]).toEqual(DEFAULT_INDUSTRY_EXTENSION_FIELDS[0]);
  });
});

describe("Annoncer under e-mail", () => {
  it("tilføjer ikke Annoncer-felter på tom config", () => {
    const cfg = mergeDefaultExtensions({ extensions: {} });
    expect(cfg.extensions.email).toBeUndefined();
    expect(hasAnnoncerEmailFields(cfg)).toBe(false);
  });

  it("enableAnnoncerEmailFields indsætter de fire nøgler øverst og bevarer øvrige", () => {
    const base = mergeDefaultExtensions({
      extensions: { email: [{ key: "kontaktperson", label: "Kontaktperson" }] },
    });
    const cfg = enableAnnoncerEmailFields(base);
    expect(cfg.extensions.email?.map((f) => f.key)).toEqual([
      "annoncer",
      "kanaler",
      "antal_kampagner",
      "egenkapital",
      "kontaktperson",
    ]);
    expect(hasAnnoncerEmailFields(cfg)).toBe(true);
  });

  it("disableAnnoncerEmailFields fjerner kun Annoncer-nøglerne", () => {
    const enabled = enableAnnoncerEmailFields({
      extensions: { email: [{ key: "kontaktperson", label: "Kontaktperson" }] },
    });
    const cfg = disableAnnoncerEmailFields(enabled);
    expect(cfg.extensions.email?.map((f) => f.key)).toEqual(["kontaktperson"]);
    expect(hasAnnoncerEmailFields(cfg)).toBe(false);
  });

  it("parseFieldConfig sorterer Annoncer-felter i kanonisk rækkefølge", () => {
    const raw = serializeFieldConfig({
      extensions: {
        email: [
          { key: "egenkapital", label: "Egenkapital" },
          { key: "annoncer", label: "Annoncer" },
          { key: "ekstra", label: "Ekstra" },
          { key: "kanaler", label: "Kanaler" },
          { key: "antal_kampagner", label: "Antal kampagner" },
        ],
      },
    });
    const cfg = parseFieldConfig(raw);
    expect(cfg.extensions.email?.map((f) => f.key)).toEqual([
      ...FIXED_EMAIL_ANNONCER_FIELDS.map((f) => f.key),
      "ekstra",
    ]);
  });

  it("mappingTargetsAnnoncerFields og customFieldsHaveAnnoncerData", () => {
    expect(mappingTargetsAnnoncerFields({ Col: "custom:annoncer" })).toBe(true);
    expect(mappingTargetsAnnoncerFields({ Col: "companyName" })).toBe(false);
    expect(customFieldsHaveAnnoncerData({ annoncer: "True" })).toBe(true);
    expect(customFieldsHaveAnnoncerData({ annoncer: "  ", kanaler: "" })).toBe(false);
  });
});
