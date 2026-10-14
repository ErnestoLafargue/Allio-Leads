import { describe, expect, it } from "vitest";
import { SentenceSplitter } from "./practice/simulate";

describe("SentenceSplitter", () => {
  it("giver hele sætninger, så snart de er færdige, og resten til sidst", () => {
    const s = new SentenceSplitter();
    expect(s.push("Det kan jeg godt forstå. Jeg ri")).toEqual(["Det kan jeg godt forstå."]);
    expect(s.push("nger egentlig bare, fordi vi har set noget interessant. Er det ")).toEqual(["Jeg ringer egentlig bare, fordi vi har set noget interessant."]);
    expect(s.push("okay?")).toEqual([]);
    expect(s.flush()).toBe("Er det okay?");
  });

  it("slår korte stumper sammen med næste sætning", () => {
    const s = new SentenceSplitter();
    expect(s.push("Ja. Det giver god mening, Mette. ")).toEqual(["Ja. Det giver god mening, Mette."]);
  });
});
