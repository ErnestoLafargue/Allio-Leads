import { describe, expect, it } from "vitest";
import { effectiveResponses, rankFeedback, type Vote } from "./feedback";

const v = (line: string, helpful: boolean, category = "price"): Vote => ({ category, line, helpful });

describe("rankFeedback", () => {
  it("regner netto pr. replik, så én 👎 ikke sletter et godt svar", () => {
    const bank = rankFeedback([v("A", true), v("A", true), v("A", false), v("B", false), v("C", true)]);
    expect(bank.price?.liked.map((l) => [l.line, l.net])).toEqual([["A", 1], ["C", 1]]);
    expect(bank.price?.avoid.map((l) => l.line)).toEqual(["B"]);
  });

  it("ignorerer kort uden vurdering eller kategori", () => {
    expect(rankFeedback([{ category: null, line: "X", helpful: true }, { category: "price", line: "Y", helpful: null }])).toEqual({});
  });
});

describe("effectiveResponses", () => {
  it("bruger et godkendt svar (netto ≥ 2) som straks-kort frem for ugens script", () => {
    const bank = rankFeedback([v("Godt svar", true), v("Godt svar", true)]);
    expect(effectiveResponses({ price: "Script-svar" }, bank).price).toBe("Godt svar");
  });

  it("dropper scriptets svar, når sælgerne har givet det 👎", () => {
    const bank = rankFeedback([v("Script-svar", false)]);
    expect(effectiveResponses({ price: "Script-svar", send_email: "Mail-svar" }, bank)).toEqual({ send_email: "Mail-svar" });
  });

  it("beholder scriptets svar ved kun ét 👍 til et andet svar", () => {
    const bank = rankFeedback([v("Andet", true)]);
    expect(effectiveResponses({ price: "Script-svar" }, bank).price).toBe("Script-svar");
  });
});
