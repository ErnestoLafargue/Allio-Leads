import { describe, expect, it } from "vitest";
import { pickWeighted, weightCategories } from "./practice";

describe("weightCategories", () => {
  it("vægter sælgerens svage kategorier tungest", () => {
    const w = weightCategories([
      { category: "price", handling: "weak", customer: { quote: "x" } },
      { category: "price", handling: "none", customer: { quote: "x" } },
      { category: "send_email", handling: "strong", customer: { quote: "x" } },
      { category: "other", handling: "weak", customer: { quote: "x" } },
    ]);
    expect(w.get("price")).toBe(7);
    expect(w.get("send_email")).toBe(1.5);
    expect(w.has("other")).toBe(false);
  });
});

describe("pickWeighted", () => {
  it("vælger efter vægt og giver null uden vægt", () => {
    const items: [string, number][] = [["a", 1], ["b", 3]];
    expect(pickWeighted(items, () => 0.1)).toBe("a");
    expect(pickWeighted(items, () => 0.9)).toBe("b");
    expect(pickWeighted<string>([], () => 0.5)).toBeNull();
  });
});
