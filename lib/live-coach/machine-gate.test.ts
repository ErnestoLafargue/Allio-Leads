import { describe, expect, it } from "vitest";
import { MachineGate } from "./machine-gate";

describe("MachineGate", () => {
  it("er tavs resten af opkaldet ved en telefonsvarer", () => {
    const g = new MachineGate();
    expect(g.onCustomer("Hej, du har ringet til Klinik Sol. Læg en besked efter tonen", true)).toBe(false);
    expect(g.onCustomer("hvad koster det", true)).toBe(false);
    expect(g.state).toBe("voicemail");
  });

  it("holder pause under omstilling og vågner, når en person svarer", () => {
    const g = new MachineGate();
    expect(g.onCustomer("Velkommen til Sansa Massage. Vent venligst.", true)).toBe(false);
    expect(g.onCustomer("Sansa Massage, det er", false)).toBe(false);
    expect(g.onCustomer("Sansa Massage, det er Mette", true)).toBe(true);
    expect(g.silent).toBe(false);
  });

  it("lader kunden tale om telefonsvarere, når samtalen er i gang", () => {
    const g = new MachineGate();
    g.onCustomer("Ja hej, det er Lise", true);
    g.onCustomer("Ja, det er mig", true);
    expect(g.onCustomer("Vi har bare en telefonsvarer på, og så ringer vi tilbage", true)).toBe(true);
    expect(g.state).toBe("human");
  });
});
