import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNANSWERED_COOLDOWN_HOURS,
  isUnansweredCooldownExpired,
  normalizeUnansweredCooldownHours,
  parseUnansweredCooldownHoursInput,
} from "./lead-attempts";

describe("normalizeUnansweredCooldownHours", () => {
  it("bruger default 2 timer ved null/undefined", () => {
    expect(normalizeUnansweredCooldownHours(null)).toBe(DEFAULT_UNANSWERED_COOLDOWN_HOURS);
    expect(normalizeUnansweredCooldownHours(undefined)).toBe(DEFAULT_UNANSWERED_COOLDOWN_HOURS);
  });

  it("håndhæver minimum 1 time", () => {
    expect(normalizeUnansweredCooldownHours(0)).toBe(1);
    expect(normalizeUnansweredCooldownHours(-5)).toBe(1);
  });

  it("accepterer vilkårligt høje værdier", () => {
    expect(normalizeUnansweredCooldownHours(48)).toBe(48);
  });
});

describe("isUnansweredCooldownExpired", () => {
  const now = new Date("2026-07-10T14:00:00.000Z").getTime();

  it("udløber efter 2 timer med default cooldown", () => {
    const markedAt = new Date("2026-07-10T11:59:59.000Z");
    expect(isUnansweredCooldownExpired(markedAt, 2, now)).toBe(true);
  });

  it("udløber ikke før 2 timer er gået", () => {
    const markedAt = new Date("2026-07-10T12:00:01.000Z");
    expect(isUnansweredCooldownExpired(markedAt, 2, now)).toBe(false);
  });

  it("respekterer kampagne-specifik cooldown (4 timer vs 2 timer)", () => {
    const markedAt = new Date("2026-07-10T10:30:00.000Z");
    expect(isUnansweredCooldownExpired(markedAt, 2, now)).toBe(true);
    expect(isUnansweredCooldownExpired(markedAt, 4, now)).toBe(false);
  });
});

describe("parseUnansweredCooldownHoursInput", () => {
  it("parser gyldige heltal >= 1", () => {
    expect(parseUnansweredCooldownHoursInput(3)).toBe(3);
    expect(parseUnansweredCooldownHoursInput("12")).toBe(12);
  });

  it("afviser ugyldige værdier", () => {
    expect(parseUnansweredCooldownHoursInput(0)).toBeNull();
    expect(parseUnansweredCooldownHoursInput("")).toBeNull();
    expect(parseUnansweredCooldownHoursInput("abc")).toBeNull();
  });
});
