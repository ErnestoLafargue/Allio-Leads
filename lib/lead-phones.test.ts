import { describe, expect, it } from "vitest";
import {
  nextDialPhoneAfterFailure,
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
      visiblePersonExtensionFields({ stifter: "Anna", direktor: "", fuldt_ansvarlig_person: "Bo" }, cfg),
    ).toEqual([
      { key: "stifter", label: "Stifter" },
      { key: "fuldt_ansvarlig_person", label: "Fuldt ansvarlig deltager" },
    ]);
  });
});
