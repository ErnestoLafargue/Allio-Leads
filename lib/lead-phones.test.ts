import { describe, expect, it } from "vitest";
import {
  dialNumberMenu,
  nextDialPhoneAfterFailure,
  phoneExtensionDialPhones,
  orderedDialPhones,
  pickPowerDialTarget,
  primaryDialPhone,
  primaryDialPhoneE164,
  visibleLeadPhoneFields,
  visiblePersonExtensionFields,
} from "./lead-phones";
import { parseFieldConfig } from "./campaign-fields";

describe("visibleLeadPhoneFields", () => {
  it("viser kun virksomhed når begge er tomme", () => {
    expect(visibleLeadPhoneFields("", "")).toEqual({ showCompany: true, showPrivate: false });
  });

  it("viser kun virksomhed når kun virksomhed er sat", () => {
    expect(visibleLeadPhoneFields("12345678", "")).toEqual({
      showCompany: true,
      showPrivate: false,
    });
  });

  it("viser kun privat når kun privat er sat", () => {
    expect(visibleLeadPhoneFields("", "87654321")).toEqual({
      showCompany: false,
      showPrivate: true,
    });
  });

  it("viser begge når begge er sat", () => {
    expect(visibleLeadPhoneFields("12345678", "87654321")).toEqual({
      showCompany: true,
      showPrivate: true,
    });
  });
});

describe("orderedDialPhones / priority", () => {
  it("default PRIVATE_FIRST", () => {
    expect(primaryDialPhone("11111111", "22222222")).toBe("22222222");
    expect(primaryDialPhoneE164("87654321", "12345678")).toBe("+4512345678");
  });

  it("COMPANY_FIRST", () => {
    expect(primaryDialPhone("11111111", "22222222", "COMPANY_FIRST")).toBe("11111111");
  });

  it("kun ét nummer", () => {
    expect(orderedDialPhones("11111111", "", "PRIVATE_FIRST")).toEqual([
      { kind: "COMPANY", raw: "11111111", e164: "+4511111111" },
    ]);
    expect(orderedDialPhones("", "22222222", "COMPANY_FIRST")).toEqual([
      { kind: "PRIVATE", raw: "22222222", e164: "+4522222222" },
    ]);
  });

  it("fjerner dublet E.164", () => {
    expect(orderedDialPhones("12345678", "12345678")).toHaveLength(1);
  });

  it("fjerner samme nummer med forskellig formattering (+45 vs 8 cifre)", () => {
    const ordered = orderedDialPhones("+45 12 34 56 78", "12345678", "PRIVATE_FIRST");
    expect(ordered).toHaveLength(1);
    expect(ordered[0]?.e164).toBe("+4512345678");
    expect(nextDialPhoneAfterFailure("+4512345678", "12345678", "+4512345678", "PRIVATE_FIRST")).toBeNull();
    expect(
      pickPowerDialTarget({
        phone: "12345678",
        privatePhone: "+4512345678",
        priority: "PRIVATE_FIRST",
        dialFailoverPendingE164: "+4512345678",
      }),
    ).toBeNull();
  });

  it("nextDialPhoneAfterFailure", () => {
    const next = nextDialPhoneAfterFailure("11111111", "22222222", "+4522222222", "PRIVATE_FIRST");
    expect(next?.e164).toBe("+4511111111");
    expect(nextDialPhoneAfterFailure("11111111", "22222222", "+4511111111", "PRIVATE_FIRST")).toBeNull();
  });

  it("pickPowerDialTarget respekterer pending failover", () => {
    expect(
      pickPowerDialTarget({
        phone: "11111111",
        privatePhone: "22222222",
        priority: "PRIVATE_FIRST",
      })?.e164,
    ).toBe("+4522222222");
    expect(
      pickPowerDialTarget({
        phone: "11111111",
        privatePhone: "22222222",
        priority: "PRIVATE_FIRST",
        dialFailoverPendingE164: "+4522222222",
      })?.e164,
    ).toBe("+4511111111");
  });
});

describe("visiblePersonExtensionFields", () => {
  const cfg = parseFieldConfig("{}");

  it("viser kun FAD tom når ingen personværdier", () => {
    expect(visiblePersonExtensionFields({}, cfg)).toEqual([
      { key: "fuldt_ansvarlig_person", label: "Fuldt ansvarlig deltager" },
    ]);
  });

  it("viser kun felter med værdi", () => {
    expect(
      visiblePersonExtensionFields(
        {
          stifter: "Anna",
          direktor: "",
          fuldt_ansvarlig_person: "Bo",
          hjemmeside_ansvarlig: "Carla",
          virksomhedsejer: "Dan",
        },
        cfg,
      ),
    ).toEqual([
      { key: "stifter", label: "Stifter" },
      { key: "fuldt_ansvarlig_person", label: "Fuldt ansvarlig deltager" },
      { key: "hjemmeside_ansvarlig", label: "Hjemmeside Ansvarlig" },
      { key: "virksomhedsejer", label: "Virksomhedsejer" },
    ]);
  });

  it("skjuler Hjemmeside Ansvarlig og Virksomhedsejer når tom", () => {
    expect(
      visiblePersonExtensionFields(
        { stifter: "Anna", hjemmeside_ansvarlig: "  ", virksomhedsejer: "" },
        cfg,
      ),
    ).toEqual([{ key: "stifter", label: "Stifter" }]);
  });
});

describe("Telefon nummer 2 i opkaldsmenuen", () => {
  const fieldConfig = JSON.stringify({
    extensions: {
      phone: [
        { key: "kontakt_person_1", label: "Kontakt person 1" },
        { key: "telefon_nummer_2", label: "Telefon nummer 2" },
        { key: "kontakt_person_2", label: "Kontakt person 2" },
      ],
    },
  });
  const custom = {
    kontakt_person_1: "Official",
    telefon_nummer_2: " +4551335000",
    kontakt_person_2: "Morten Helge Hansen",
  };

  it("tager kun felter under Telefonnummer, der indeholder et gyldigt nummer", () => {
    expect(phoneExtensionDialPhones(fieldConfig, custom)).toEqual([
      { label: "Telefon nummer 2", raw: "+4551335000" },
    ]);
  });

  it("nyt nummer i Telefon nummer 2 giver en rullemenu med begge numre", () => {
    const menu = dialNumberMenu("+4527240451", "", "PRIVATE_FIRST", phoneExtensionDialPhones(fieldConfig, custom));
    expect(menu.map((m) => m.label)).toEqual([
      "Virksomhed · +4527240451",
      "Telefon nummer 2 · +4551335000",
    ]);
  });

  it("samme nummer som virksomhed/privat vises kun én gang", () => {
    const menu = dialNumberMenu("+4551335000", "", "PRIVATE_FIRST", [
      { label: "Telefon nummer 2", raw: "51 33 50 00" },
    ]);
    expect(menu).toHaveLength(1);
  });

  it("tomt felt eller kampagne uden telefonfelter ændrer intet", () => {
    expect(phoneExtensionDialPhones(fieldConfig, { telefon_nummer_2: "" })).toEqual([]);
    expect(phoneExtensionDialPhones("{}", custom)).toEqual([]);
  });
});
