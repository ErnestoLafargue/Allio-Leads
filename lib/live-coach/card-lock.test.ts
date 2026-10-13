import { describe, expect, it } from "vitest";
import { CardLock, MAX_DWELL_MS, MIN_DWELL_MS, saidSimilar } from "./card-lock";

const LINE = "Det giver mening. Specialisten viser jer, hvor mange inaktive kunder I kan hente tilbage — passer mandag eller onsdag?";

describe("saidSimilar", () => {
  it("genkender replikken, også med egne ord og bøjninger", () => {
    expect(saidSimilar(LINE, "ja men specialisten kan vise jer hvor mange inaktive kunder i kan hente, passer mandag?")).toBe(true);
    expect(saidSimilar(LINE, "okay, hvad bruger I af system i dag?")).toBe(false);
  });
});

describe("CardLock", () => {
  it("holder kortet, når kunden gentager samme indvending", () => {
    const lock = new CardLock();
    lock.show({ category: "price", line: LINE, source: "ai", shownAt: 0 });
    expect(lock.canShow("price", "ai", 5_000)).toBe(false);
    expect(lock.canShow("price", "ai", MIN_DWELL_MS + 1)).toBe(false);
    expect(lock.canShow(null, "ai", 5_000)).toBe(false);
  });

  it("skifter efter et stykke tid, når samtalen har udviklet sig", () => {
    const lock = new CardLock();
    lock.show({ category: "price", line: LINE, source: "ai", shownAt: 0 });
    expect(lock.canShow("price", "ai", 10_000, true)).toBe(false);
    expect(lock.canShow("price", "ai", MIN_DWELL_MS, true)).toBe(true);
    expect(lock.canShow("price", "trigger", MIN_DWELL_MS)).toBe(false);
  });

  it("lader en ny indvending komme efter et stykke tid", () => {
    const lock = new CardLock();
    lock.show({ category: "price", line: LINE, source: "ai", shownAt: 0 });
    expect(lock.canShow("no_time", "trigger", 5_000)).toBe(false);
    expect(lock.canShow("no_time", "trigger", MIN_DWELL_MS)).toBe(true);
    expect(lock.canShow(null, "ai", MAX_DWELL_MS)).toBe(true);
  });

  it("frigiver kortet, når sælgeren har sagt det", () => {
    const lock = new CardLock();
    lock.show({ category: "price", line: LINE, source: "ai", shownAt: 0 });
    expect(lock.onAgentSpeech("ja det giver god mening, specialisten", true)).toBe(false);
    expect(lock.onAgentSpeech("viser jer hvor mange inaktive kunder", false)).toBe(true);
    expect(lock.active).toBeNull();
    expect(lock.canShow("price", "ai", 1_000)).toBe(true);
  });

  it("lader AI-versionen afløse straks-kortet kun i de første sekunder", () => {
    const lock = new CardLock();
    lock.show({ category: "price", line: "fra scriptet", source: "trigger", shownAt: 0 });
    expect(lock.canShow("price", "ai", 2_000)).toBe(true);
    expect(lock.canShow("price", "ai", 6_000)).toBe(false);
  });
});
