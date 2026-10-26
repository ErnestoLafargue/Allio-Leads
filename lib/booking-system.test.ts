import { describe, expect, it } from "vitest";
import { defaultBookingSystemForCampaign, resolveLeadBookingSystem } from "./booking-system";

describe("defaultBookingSystemForCampaign", () => {
  it("bruger kampagnenavnet for bookingsystem-kampagner", () => {
    for (const name of [
      "Gecko Booking",
      "GeckoBooking",
      "Onlinebooq",
      "Timma Booking",
      "Cbit Booking",
      "Planway",
      "EasyPractice",
      "Terapeutbooking",
    ]) {
      expect(defaultBookingSystemForCampaign({ name })).toBe(name);
    }
  });

  it("er tom for øvrige kampagner og systemkampagner", () => {
    expect(defaultBookingSystemForCampaign({ name: "Hintly Leads m. Ads" })).toBe("");
    expect(defaultBookingSystemForCampaign({ name: "Skønheds Klinikker" })).toBe("");
    expect(defaultBookingSystemForCampaign({ name: "Fresha Booking" })).toBe("");
    expect(defaultBookingSystemForCampaign({ name: "Genbook møde", isSystemCampaign: true })).toBe("");
    expect(defaultBookingSystemForCampaign({ name: "Kommende møder", isSystemCampaign: true })).toBe("");
    expect(defaultBookingSystemForCampaign(null)).toBe("");
  });
});

describe("resolveLeadBookingSystem", () => {
  it("fil-værdi vinder over kampagnens standard", () => {
    expect(resolveLeadBookingSystem(" Planway ", { name: "Gecko Booking" })).toBe("Planway");
    expect(resolveLeadBookingSystem("Timma", { name: "Hintly Leads m. Ads" })).toBe("Timma");
  });

  it("falder tilbage til kampagnens standard (tom i Hintly)", () => {
    expect(resolveLeadBookingSystem("", { name: "Gecko Booking" })).toBe("Gecko Booking");
    expect(resolveLeadBookingSystem(undefined, { name: "Hintly Leads m. Ads" })).toBe("");
  });
});
