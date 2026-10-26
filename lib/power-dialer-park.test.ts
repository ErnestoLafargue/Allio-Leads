import { describe, expect, it } from "vitest";
import { POWER_PARK_TIMEOUT_MS } from "@/lib/power-dialer-constants";

describe("Power Dialer park (Twilio-mønster)", () => {
  it("park-timeout er længere end ét agent-SIP-forsøg (12s), så kunden ikke drops med det samme", () => {
    expect(POWER_PARK_TIMEOUT_MS).toBeGreaterThan(12_000);
    expect(POWER_PARK_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });
});
