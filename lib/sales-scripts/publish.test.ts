import { describe, expect, it } from "vitest";
import { isoWeekKey, sanitizeWeeklyScript } from "./publish";

const script = {
  title: "Ugens script",
  summary: "Kort.",
  sections: [
    {
      key: "opening",
      title: "Åbning",
      lines: [{ text: "Hej, det er Emil fra Allio.", note: null, evidenceCalls: ["kendt", "opdigtet"] }],
      evidence: "12 samtaler.",
    },
  ],
  objections: [
    {
      category: "has_booking_system",
      customerSays: "Vi har et bookingsystem.",
      response: "Det giver god mening …",
      evidence: "Stærk håndtering i 8 af 10.",
      evidenceCalls: ["opdigtet"],
    },
  ],
  changes: [],
  caveats: ["For få samtaler med pris-indvendinger."],
};

describe("ugens script", () => {
  it("beregner ISO-uge (også omkring årsskiftet)", () => {
    expect(isoWeekKey(new Date("2026-09-27T12:00:00Z"))).toBe("2026-W39");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2026-01-05T12:00:00Z"))).toBe("2026-W02");
  });

  it("fjerner henvisninger til samtaler, der ikke står i evidenspakken", () => {
    const clean = sanitizeWeeklyScript(script, new Set(["kendt"]));
    expect(clean.sections[0]!.lines[0]!.evidenceCalls).toEqual(["kendt"]);
    expect(clean.objections[0]!.evidenceCalls).toEqual([]);
  });

  it("afviser scripts, der ikke følger skemaet", () => {
    expect(() => sanitizeWeeklyScript({ ...script, sections: [{ key: "pitch" }] }, new Set())).toThrow();
  });
});
