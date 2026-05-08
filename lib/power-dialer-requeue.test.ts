import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  POWER_DIALER_REQUEUE_COOLDOWN_MS_DEFAULT,
  parsePowerDialerRequeueCooldownMs,
} from "./power-dialer-requeue";

describe("parsePowerDialerRequeueCooldownMs", () => {
  const key = "POWER_DIALER_REQUEUE_COOLDOWN_MINUTES";
  let snapshot: string | undefined;

  beforeEach(() => {
    snapshot = process.env[key];
  });

  afterEach(() => {
    if (snapshot === undefined) delete process.env[key];
    else process.env[key] = snapshot;
  });

  it("default 10 minutter når env mangler", () => {
    delete process.env[key];
    expect(parsePowerDialerRequeueCooldownMs()).toBe(POWER_DIALER_REQUEUE_COOLDOWN_MS_DEFAULT);
  });

  it("parser minutter fra env", () => {
    process.env[key] = "15";
    expect(parsePowerDialerRequeueCooldownMs()).toBe(15 * 60 * 1000);
  });

  it("falder tilbage ved ugyldig værdi", () => {
    process.env[key] = "not-a-number";
    expect(parsePowerDialerRequeueCooldownMs()).toBe(POWER_DIALER_REQUEUE_COOLDOWN_MS_DEFAULT);
  });
});
