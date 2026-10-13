import { describe, expect, it } from "vitest";
import { bestCandidates, bookingRates, reactionAfter, worstCandidates } from "./collect";

const o = (handling: string, booked: boolean, response: string | null = "svar", reaction: string | null = null) => ({ handling, booked, response, reaction });

describe("bookingRates", () => {
  it("regner bookingrate ved god og dårlig behandling og kræver nok data", () => {
    const items = [...Array(5)].map((_, i) => o("strong", i < 3)).concat([o("weak", false), o("none", false)]);
    expect(bookingRates(items)).toEqual({ bookedGood: 0.6, bookedBad: null, nGood: 5, nBad: 2 });
  });
});

describe("kandidater", () => {
  it("vælger bookede, stærke svar som bedste og ubesvarede uden møde som dårligste", () => {
    const items = [o("ok", false), o("strong", true, "s", "ja"), o("strong", false), o("weak", true), o("none", false, null), o("weak", false)];
    expect(bestCandidates(items).map((x) => x.handling)).toEqual(["strong", "strong", "ok"]);
    expect(bestCandidates(items)[0]!.booked).toBe(true);
    expect(worstCandidates(items).map((x) => x.handling)).toEqual(["none", "weak"]);
  });
});

describe("reactionAfter", () => {
  it("tager kundens næste ord kort efter svaret", () => {
    const segs = [
      { speaker: "customer" as const, start: 0, end: 2, text: "Hvad koster det?" },
      { speaker: "agent" as const, start: 2, end: 6, text: "Specialisten viser først værdien." },
      { speaker: "customer" as const, start: 6.5, end: 8, text: "Okay, det lyder fair." },
      { speaker: "customer" as const, start: 60, end: 62, text: "Langt senere." },
    ];
    expect(reactionAfter(segs, 1)).toBe("Okay, det lyder fair.");
    expect(reactionAfter(segs, 3)).toBeNull();
  });
});
