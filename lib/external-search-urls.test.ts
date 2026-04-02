import { describe, expect, it } from "vitest";
import { buildGoogleSearchUrl } from "./external-search-urls";

describe("buildGoogleSearchUrl", () => {
  it("returnerer null for tom streng", () => {
    expect(buildGoogleSearchUrl("")).toBeNull();
    expect(buildGoogleSearchUrl("   ")).toBeNull();
  });

  it("encoder query til Google search URL", () => {
    expect(buildGoogleSearchUrl("Acme ApS")).toBe("https://www.google.com/search?q=Acme%20ApS");
    expect(buildGoogleSearchUrl("  Foo & Bar  ")).toBe("https://www.google.com/search?q=Foo%20%26%20Bar");
  });
});
