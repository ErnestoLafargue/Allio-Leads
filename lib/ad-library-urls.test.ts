import { describe, expect, it } from "vitest";
import {
  cleanBusinessName,
  buildFacebookAdsLibraryUrl,
  buildGoogleAdsTransparencyUrl,
  buildInstagramAdsLibraryUrl,
} from "./ad-library-urls";

describe("cleanBusinessName", () => {
  it("fjerner suffix efter v/", () => {
    expect(cleanBusinessName("Liljas Hudpleje v/Gitte Lilja Christiansen")).toBe("Liljas Hudpleje");
  });

  it("fjerner suffix efter v /", () => {
    expect(cleanBusinessName("Test ApS v / Owner")).toBe("Test ApS");
  });

  it("fjerner suffix efter ved", () => {
    expect(cleanBusinessName("Butik ved Vejle")).toBe("Butik");
  });

  it("bevarer navn uden suffix", () => {
    expect(cleanBusinessName("Lilly Nails")).toBe("Lilly Nails");
  });

  it("trimmer og collapse mellemrum", () => {
    expect(cleanBusinessName("  Foo   Bar  ")).toBe("Foo Bar");
  });

  it("tom streng", () => {
    expect(cleanBusinessName("")).toBe("");
    expect(cleanBusinessName("   ")).toBe("");
  });
});

describe("buildGoogleAdsTransparencyUrl", () => {
  it("bygger søgning med region DK", () => {
    expect(buildGoogleAdsTransparencyUrl("Lilly Nails")).toBe(
      "https://adstransparency.google.com/search?region=DK&query=Lilly+Nails",
    );
  });

  it("null ved tomt", () => {
    expect(buildGoogleAdsTransparencyUrl("")).toBeNull();
  });
});

describe("buildFacebookAdsLibraryUrl", () => {
  it("indeholder quoted query og DK", () => {
    const u = buildFacebookAdsLibraryUrl("Lilly Nails");
    expect(u).toContain("facebook.com/ads/library");
    expect(u).toContain("country=DK");
    expect(u).toMatch(/q=%22Lilly(\+|%20)Nails%22/);
    expect(u).toContain("search_type=keyword_exact_phrase");
  });
});

describe("buildInstagramAdsLibraryUrl", () => {
  it("matcher Facebook (Meta bibliotek)", () => {
    const a = buildInstagramAdsLibraryUrl("X ApS");
    const b = buildFacebookAdsLibraryUrl("X ApS");
    expect(a).toBe(b);
  });
});
