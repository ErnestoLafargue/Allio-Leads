import { describe, expect, it } from "vitest";
import { localDayKeyFromMs, parseDateStringLoose, timestampForSort } from "./parse-date-string";
import { findStartDateExtensionField, parseFieldConfig } from "./campaign-fields";

describe("parseDateStringLoose", () => {
  it("parser dansk dd.mm.yyyy", () => {
    const ms = parseDateStringLoose("11.01.2000");
    expect(ms).not.toBeNull();
    expect(localDayKeyFromMs(ms!)).toBe("2000-01-11");
  });
});

describe("timestampForSort", () => {
  it("accepterer ISO med tid", () => {
    const t = timestampForSort("2026-04-11T14:30:00.000Z");
    expect(Number.isFinite(t)).toBe(true);
  });
});

describe("findStartDateExtensionField", () => {
  it("finder felt med label Start dato", () => {
    const cfg = parseFieldConfig(
      JSON.stringify({
        extensions: {
          industry: [{ key: "start_dato", label: "Start dato" }],
        },
      }),
    );
    const f = findStartDateExtensionField(cfg);
    expect(f?.key).toBe("start_dato");
  });
});
