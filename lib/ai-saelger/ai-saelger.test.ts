import { describe, expect, it } from "vitest";
import { allVariants, forSpeech, VOICES } from "./agents";
import { pitchNumbers } from "./pitch-numbers";
import { parseRouterLabel } from "./router";
import { orderDays, proposeTwo } from "./slot-order";
import { aiSaelgerSystemPrompt } from "./system-prompt";
import { isBackchannel, onCustomerSpeechWhileAgentSpeaks, shouldBargeIn, silenceTimeoutMs } from "./turn-taking";

describe("varianter", () => {
  it("3 tilgange × 3 stemmer = 9 agenter", () => {
    const v = allVariants();
    expect(v).toHaveLength(9);
    expect(new Set(v.map((x) => x.key)).size).toBe(9);
  });
  it("fjerner lyd-tags for stemmer uden tags", () => {
    const turbo = VOICES.find((v) => !v.audioTags)!;
    expect(forSpeech("Det er ikke et salgsopkald [laughs] – helt ærligt.", turbo)).toBe("Det er ikke et salgsopkald – helt ærligt.");
  });
  it("systemprompten bruger agentens navn og forbyder at benægte AI", () => {
    const katrine = allVariants().find((v) => v.voice.agentName === "Katrine")!;
    const p = aiSaelgerSystemPrompt(katrine, "");
    expect(p).toContain("Du er Katrine");
    expect(p).toContain("lyver du ikke");
  });
});

describe("mødetider fyldes bagfra", () => {
  // Onsdag 14/10-2026. Torsdag 15, fredag 16, uge efter: man 19 … fre 23, så 26–28.
  const today = "2026-10-14";
  const day = (dayKey: string) => ({ dayKey, times: ["10:00", "09:00"] });
  const days = ["2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-28"].map(day);

  it("fredag før torsdag, uge for uge, så onsdag", () => {
    expect(orderDays(today, days).map((d) => d.dayKey)).toEqual(["2026-10-16", "2026-10-15", "2026-10-23", "2026-10-22", "2026-10-21", "2026-10-28"]);
  });
  it("mandag/tirsdag kun når det er tilladt, og til sidst", () => {
    const o = orderDays(today, days, { allowMondayTuesday: true }).map((d) => d.dayKey);
    expect(o.slice(-2)).toEqual(["2026-10-20", "2026-10-19"]);
  });
  it("foreslår to dage med første ledige tid", () => {
    expect(proposeTwo(today, days)).toEqual([
      { dayKey: "2026-10-16", time: "09:00" },
      { dayKey: "2026-10-15", time: "09:00" },
    ]);
  });
  it("springer over dage uden for 14 dage og fyldte dage", () => {
    expect(orderDays(today, [{ dayKey: "2026-10-30", times: ["09:00"] }, { dayKey: "2026-10-16", times: [] }])).toEqual([]);
  });
});

describe("tal i pitchen", () => {
  it("rammer 10–20 genbookinger med 2–5 %", () => {
    expect(pitchNumbers(1000)).toEqual({ customers: 1000, inactive: 400, ratePct: 3, rebookingsPerMonth: 12 });
  });
  it("store kartoteker siges forsigtigt (højst 20)", () => {
    expect(pitchNumbers(5000).rebookingsPerMonth).toBe(20);
    expect(pitchNumbers(5000).ratePct).toBe(2);
  });
  it("små kartoteker får det reelle tal, højst 12 %", () => {
    expect(pitchNumbers(100)).toEqual({ customers: 100, inactive: 40, ratePct: 12, rebookingsPerMonth: 5 });
  });
});

describe("router og turtagning", () => {
  it("parser routerens ord robust", () => {
    expect(parseRouterLabel("Indvending.")).toBe("indvending");
    expect(parseRouterLabel("label: købssignal")).toBe("koebssignal");
    expect(parseRouterLabel("???")).toBe("andet");
  });
  it("«mm» og «ja ja» er lytning", () => {
    expect(isBackchannel("Mm.")).toBe(true);
    expect(isBackchannel("ja ja")).toBe(true);
    expect(isBackchannel("ja men vi har altså et system")).toBe(false);
    expect(onCustomerSpeechWhileAgentSpeaks("mhm").action).toBe("keep_talking");
    expect(onCustomerSpeechWhileAgentSpeaks("vent lige, hvad koster det").action).toBe("finish_phrase_then_yield");
  });
  it("bryder ind ved forkert antagelse og lange monologer, men højst to gange", () => {
    expect(shouldBargeIn({ label: "forkert_antagelse", customerWordsThisTurn: 8, bargeInsSoFar: 0 })).toBe(true);
    expect(shouldBargeIn({ label: "andet", customerWordsThisTurn: 80, bargeInsSoFar: 1 })).toBe(true);
    expect(shouldBargeIn({ label: "andet", customerWordsThisTurn: 20, bargeInsSoFar: 0 })).toBe(false);
    expect(shouldBargeIn({ label: "forkert_antagelse", customerWordsThisTurn: 30, bargeInsSoFar: 2 })).toBe(false);
  });
  it("tavshed 3–5 sek.", () => {
    expect(silenceTimeoutMs(() => 0)).toBe(3000);
    expect(silenceTimeoutMs(() => 1)).toBe(5000);
  });
});
