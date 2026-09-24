import { describe, expect, it } from "vitest";
import {
  applyPowerDialerSettingsPatch,
  POWER_DIALER_DEFAULTS,
  powerDialerSettingsFromCampaign,
  powerDialerSettingsToColumns,
} from "@/lib/power-dialer-settings";

describe("powerDialerSettingsFromCampaign", () => {
  it("defaults svarer til adfærden før indstillingerne (5 linjer, loft 50, 25 sek.)", () => {
    const s = powerDialerSettingsFromCampaign(null);
    expect(s).toEqual(POWER_DIALER_DEFAULTS);
    expect(s.dialRatio).toBe(5);
    expect(s.maxInFlight).toBe(50);
    expect(s.ringTimeoutSecs).toBe(25);
  });

  it("migrationens kolonne-defaults giver samme indstillinger", () => {
    const s = powerDialerSettingsFromCampaign({
      powerDialRatio: 5,
      powerMaxInFlight: 50,
      powerRingTimeoutSecs: 25,
      powerAmdEnabled: true,
      powerAmdUncertainAction: "CONNECT",
      powerAmdMachineCountsAttempt: true,
      powerMaxDropRatePct: 3,
      powerWrapUpSeconds: 0,
      powerPauseMode: "DRAIN",
    });
    expect(s).toEqual(POWER_DIALER_DEFAULTS);
    expect(powerDialerSettingsToColumns(s).powerDialRatio).toBe(5);
  });

  it("klipper ugyldige værdier fra DB til grænserne", () => {
    const s = powerDialerSettingsFromCampaign({
      powerDialRatio: 42,
      powerMaxInFlight: 0,
      powerRingTimeoutSecs: 3,
      powerAmdUncertainAction: "nonsense",
      powerPauseMode: "??",
      powerWrapUpSeconds: 9999,
    });
    expect(s.dialRatio).toBe(8);
    expect(s.maxInFlight).toBe(1);
    expect(s.ringTimeoutSecs).toBe(10);
    expect(s.amdUncertainAction).toBe("CONNECT");
    expect(s.pauseMode).toBe("DRAIN");
    expect(s.wrapUpSeconds).toBe(300);
  });

  it("ratio rundes til nærmeste halve", () => {
    expect(powerDialerSettingsFromCampaign({ powerDialRatio: 2.74 }).dialRatio).toBe(2.5);
  });
});

describe("applyPowerDialerSettingsPatch", () => {
  const base = { ...POWER_DIALER_DEFAULTS };

  it("accepterer gyldige ændringer, også tal som tekst med komma", () => {
    const r = applyPowerDialerSettingsPatch(base, {
      dialRatio: "2,5",
      maxInFlight: 20,
      ringTimeoutSecs: "40",
      amdEnabled: false,
      amdUncertainAction: "REQUEUE",
      amdMachineCountsAttempt: false,
      maxDropRatePct: 5,
      wrapUpSeconds: 10,
      pauseMode: "HANGUP_RINGING",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings).toEqual({
      dialRatio: 2.5,
      maxInFlight: 20,
      ringTimeoutSecs: 40,
      amdEnabled: false,
      amdUncertainAction: "REQUEUE",
      amdMachineCountsAttempt: false,
      maxDropRatePct: 5,
      wrapUpSeconds: 10,
      pauseMode: "HANGUP_RINGING",
    });
  });

  it("afviser værdier uden for grænserne med dansk fejl", () => {
    const tooHigh = applyPowerDialerSettingsPatch(base, { dialRatio: 9 });
    expect(tooHigh.ok).toBe(false);
    if (!tooHigh.ok) expect(tooHigh.error).toContain("mellem 1 og 8");

    const ring = applyPowerDialerSettingsPatch(base, { ringTimeoutSecs: 5 });
    expect(ring.ok).toBe(false);
    if (!ring.ok) expect(ring.error).toContain("Ringetid");

    const frac = applyPowerDialerSettingsPatch(base, { maxInFlight: 2.5 });
    expect(frac.ok).toBe(false);

    const mode = applyPowerDialerSettingsPatch(base, { pauseMode: "STOP" });
    expect(mode.ok).toBe(false);
  });

  it("delvist patch bevarer resten", () => {
    const r = applyPowerDialerSettingsPatch(base, { wrapUpSeconds: 15 });
    expect(r.ok && r.settings.dialRatio).toBe(5);
    expect(r.ok && r.settings.wrapUpSeconds).toBe(15);
  });

  it("tom body ændrer intet", () => {
    const r = applyPowerDialerSettingsPatch(base, undefined);
    expect(r.ok && r.settings).toEqual(base);
  });
});
