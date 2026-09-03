import { describe, expect, it } from "vitest";
import { formatAnnoncerKanaler, formatAnnoncerStatus } from "./annoncer-display";

describe("formatAnnoncerStatus", () => {
  it("mapper True/true til Aktiv", () => {
    expect(formatAnnoncerStatus("True")).toEqual({ kind: "aktiv", label: "Aktiv" });
    expect(formatAnnoncerStatus(" true ")).toEqual({ kind: "aktiv", label: "Aktiv" });
  });

  it("mapper False/false til Inaktiv", () => {
    expect(formatAnnoncerStatus("False")).toEqual({ kind: "inaktiv", label: "Inaktiv" });
    expect(formatAnnoncerStatus("FALSE")).toEqual({ kind: "inaktiv", label: "Inaktiv" });
  });

  it("mapper tomt og andet til Ikke registreret", () => {
    expect(formatAnnoncerStatus("")).toEqual({
      kind: "ikke_registreret",
      label: "Ikke registreret",
    });
    expect(formatAnnoncerStatus(null)).toEqual({
      kind: "ikke_registreret",
      label: "Ikke registreret",
    });
    expect(formatAnnoncerStatus("ukendt")).toEqual({
      kind: "ikke_registreret",
      label: "Ikke registreret",
    });
    expect(formatAnnoncerStatus("ja")).toEqual({
      kind: "ikke_registreret",
      label: "Ikke registreret",
    });
  });
});

describe("formatAnnoncerKanaler", () => {
  it("parser _ads-suffiks og title-caser", () => {
    expect(
      formatAnnoncerKanaler(
        "youtube_ads,google_maps_ads,google_search_ads,google_shopping_ads",
      ),
    ).toBe("Youtube, Google Maps, Google Search, Google Shopping");
  });

  it("håndterer mellemrum og manglende _ads", () => {
    expect(formatAnnoncerKanaler(" youtube_ads , facebook ")).toBe("Youtube, Facebook");
  });

  it("returnerer tom streng for tom input", () => {
    expect(formatAnnoncerKanaler("")).toBe("");
    expect(formatAnnoncerKanaler(null)).toBe("");
  });
});
