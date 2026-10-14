import { afterEach, describe, expect, it } from "vitest";
import {
  isPowerSonioxListeningHint,
  isPowerSonioxUnavailableError,
  notePowerSonioxStartResult,
  POWER_GREETING_SONIOX_LISTEN,
  POWER_SONIOX_SKIP_MS,
  resetPowerSonioxCircuitForTests,
  shouldAttemptPowerSoniox,
} from "@/lib/power-greeting-soniox";
import { decidePowerGreetingAction } from "@/lib/power-greeting-decision";

afterEach(() => {
  resetPowerSonioxCircuitForTests();
});

describe("isPowerSonioxUnavailableError", () => {
  it("kender credits/quota/betalingsfejl", () => {
    expect(isPowerSonioxUnavailableError(402, "")).toBe(true);
    expect(isPowerSonioxUnavailableError(429, "rate limited")).toBe(true);
    expect(isPowerSonioxUnavailableError(422, "Insufficient credits for Soniox")).toBe(true);
    expect(isPowerSonioxUnavailableError(400, "account balance too low")).toBe(true);
  });

  it("lader almindelige Telnyx-fejl være midlertidige", () => {
    expect(isPowerSonioxUnavailableError(500, "Internal server error")).toBe(false);
    expect(isPowerSonioxUnavailableError(0, "Timeout ved start af transskription.")).toBe(false);
  });
});

describe("Power Soniox-kredsløb", () => {
  it("springer Soniox over efter credits-fejl, så AMD kan køre alene", () => {
    expect(shouldAttemptPowerSoniox(0)).toBe(true);
    notePowerSonioxStartResult(false, 402, "Payment required", 1_000);
    expect(shouldAttemptPowerSoniox(1_000)).toBe(false);
    expect(shouldAttemptPowerSoniox(1_000 + POWER_SONIOX_SKIP_MS - 1)).toBe(false);
    expect(shouldAttemptPowerSoniox(1_000 + POWER_SONIOX_SKIP_MS)).toBe(true);
  });

  it("springer over efter tre almindelige fejl i træk", () => {
    notePowerSonioxStartResult(false, 500, "boom", 0);
    notePowerSonioxStartResult(false, 500, "boom", 0);
    expect(shouldAttemptPowerSoniox(0)).toBe(true);
    notePowerSonioxStartResult(false, 500, "boom", 0);
    expect(shouldAttemptPowerSoniox(0)).toBe(false);
  });

  it("åbner igen ved et vellykket start", () => {
    notePowerSonioxStartResult(false, 402, "credits", 0);
    expect(shouldAttemptPowerSoniox(0)).toBe(false);
    notePowerSonioxStartResult(true, 200, "", 0);
    expect(shouldAttemptPowerSoniox(0)).toBe(true);
  });
});

describe("isPowerSonioxListeningHint", () => {
  it("kun listen-markøren betyder at STT kører", () => {
    expect(isPowerSonioxListeningHint(POWER_GREETING_SONIOX_LISTEN)).toBe(true);
    expect(isPowerSonioxListeningHint("human")).toBe(false);
    expect(isPowerSonioxListeningHint(null)).toBe(false);
  });
});

describe("AMD uden Soniox", () => {
  it("AMD-maskine lægges på med det samme når Soniox ikke lytter", () => {
    expect(
      decidePowerGreetingAction({
        amd: "machine",
        greeting: null,
        timedOut: false,
        sonioxListening: false,
      }),
    ).toBe("VOICEMAIL");
  });

  it("usikker AMD går til sælger når Soniox ikke lytter og tiden er gået", () => {
    expect(
      decidePowerGreetingAction({
        amd: "unknown",
        greeting: null,
        timedOut: true,
        sonioxListening: false,
      }),
    ).toBe("CONNECT");
  });

  it("AMD-human forbinder stadig uden Soniox", () => {
    expect(
      decidePowerGreetingAction({
        amd: "human",
        greeting: null,
        timedOut: false,
        sonioxListening: false,
      }),
    ).toBe("CONNECT");
  });
});
