import { describe, expect, it } from "vitest";
import { formatPodioDateTimeUtc } from "./datetime";

describe("formatPodioDateTimeUtc", () => {
  it("sender UTC-streng til Podio API (samme øjeblik som 09:00 dansk tid)", () => {
    // 09:00 CPH sommer (UTC+2) = 07:00Z — Podio UI viser stadig 09:00 for DK-brugere.
    const nineAmCph = new Date("2026-06-23T07:00:00.000Z");
    expect(formatPodioDateTimeUtc(nineAmCph)).toBe("2026-06-23 07:00:00");
  });
});
