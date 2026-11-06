import { describe, expect, it } from "vitest";
import { matchPodioSellerByName } from "./sellers";

const items = [
  { itemId: 11, title: "Victor" },
  { itemId: 22, title: "Ernesto Lafargue" },
  { itemId: 33, title: "Emil" },
];

describe("matchPodioSellerByName", () => {
  it("matcher på fornavn", () => {
    expect(matchPodioSellerByName(items, "Victor Lafargue")?.itemId).toBe(11);
    expect(matchPodioSellerByName(items, "Ernesto")?.itemId).toBe(22);
  });

  it("foretrækker fuldt navn", () => {
    const withDup = [...items, { itemId: 44, title: "Emil Hansen" }];
    expect(matchPodioSellerByName(withDup, "Emil Hansen")?.itemId).toBe(44);
  });

  it("ignorerer store/små bogstaver og ekstra mellemrum", () => {
    expect(matchPodioSellerByName(items, "  victor  ")?.itemId).toBe(11);
  });

  it("intet match", () => {
    expect(matchPodioSellerByName(items, "Mads Greve")).toBeNull();
    expect(matchPodioSellerByName(items, "")).toBeNull();
  });
});
