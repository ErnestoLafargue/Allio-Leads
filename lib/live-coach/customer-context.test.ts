import { describe, expect, it } from "vitest";
import { formatCustomerContext } from "./customer-context";

describe("formatCustomerContext", () => {
  it("tager kun felter med indhold med og opsummerer tidligere samtaler", () => {
    const text = formatCustomerContext({
      companyName: "Klinik Sol",
      industry: "Massage",
      city: "Køge",
      campaign: "GeckoBook-klinikker",
      notes: "Ejer hedder Lise.  Travlt i oktober.",
      callbackNote: "",
      attempts: 2,
      priorCalls: [
        { date: new Date("2026-10-01T10:00:00Z"), outcome: "CALLBACK_SCHEDULED", summary: "Kunden bad om at blive ringet op.", nextStep: "callback: næste uge" },
      ],
    });
    expect(text).toContain("Klinik: Klinik Sol (Massage), Køge");
    expect(text).toContain("Kampagne: GeckoBook-klinikker");
    expect(text).toContain("Noter: Ejer hedder Lise. Travlt i oktober.");
    expect(text).not.toContain("Callback-note");
    expect(text).toContain("Samtale 2026-10-01: udfald CALLBACK_SCHEDULED · Kunden bad om at blive ringet op. · næste skridt: callback: næste uge");
  });
});
