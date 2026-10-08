import { describe, expect, it } from "vitest";
import { buildGoogleSearchUrl, buildHintlyLeadUrl, isKrakPersonFieldLabel } from "./external-search-urls";

describe("isKrakPersonFieldLabel", () => {
  it("matcher stifter med navn/på", () => {
    expect(isKrakPersonFieldLabel("Navn på stifter")).toBe(true);
    expect(isKrakPersonFieldLabel("Stifter navn")).toBe(true);
  });

  it("matcher direktør", () => {
    expect(isKrakPersonFieldLabel("Direktør")).toBe(true);
    expect(isKrakPersonFieldLabel("Direktor")).toBe(true);
  });

  it("matcher FAD / fuldt ansvarlig", () => {
    expect(isKrakPersonFieldLabel("Fuldt ansvarlig deltager")).toBe(true);
    expect(isKrakPersonFieldLabel("Navn (FAD)")).toBe(true);
  });

  it("matcher Hjemmeside Ansvarlig", () => {
    expect(isKrakPersonFieldLabel("Hjemmeside Ansvarlig")).toBe(true);
  });

  it("matcher Virksomhedsejer", () => {
    expect(isKrakPersonFieldLabel("Virksomhedsejer")).toBe(true);
  });

  it("matcher ikke øvrige felter", () => {
    expect(isKrakPersonFieldLabel("Virksomhedsform")).toBe(false);
    expect(isKrakPersonFieldLabel("Branche")).toBe(false);
    expect(isKrakPersonFieldLabel("Stifter alene")).toBe(false);
  });
});

describe("buildHintlyLeadUrl", () => {
  it("bygger lookup-link med DK og leadets CVR", () => {
    expect(buildHintlyLeadUrl("45634108")).toBe(
      "https://intelligence.hintly.ai/leads/lookup/DK45634108",
    );
    expect(buildHintlyLeadUrl("DK 45 63 41 08")).toBe(
      "https://intelligence.hintly.ai/leads/lookup/DK45634108",
    );
  });

  it("returnerer null uden et 8-cifret CVR", () => {
    expect(buildHintlyLeadUrl("")).toBeNull();
    expect(buildHintlyLeadUrl("123")).toBeNull();
  });
});

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
