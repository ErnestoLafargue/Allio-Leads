import { describe, expect, it } from "vitest";
import {
  assignRoles,
  dominantLanguage,
  groupTokens,
  identifyAgentLabel,
  sortSegments,
  talkSeconds,
  wordCount,
  type LabeledSegment,
} from "./segments";

const tok = (text: string, s: number, e: number, label: string | null = null) => ({
  text,
  startMs: s * 1000,
  endMs: e * 1000,
  label,
});

describe("groupTokens", () => {
  it("samler tokens pr. taler og deler ved pauser", () => {
    const segs = groupTokens([
      tok("Hal", 0.5, 0.7, "1"),
      tok("lo?", 0.7, 1.0, "1"),
      tok(" Hej", 2.0, 2.3, "2"),
      tok(" det er Emil", 2.3, 3.1, "2"),
      tok(" Ja", 6.0, 6.2, "2"),
    ]);
    expect(segs).toEqual([
      { label: "1", start: 0.5, end: 1, text: "Hallo?" },
      { label: "2", start: 2, end: 3.1, text: "Hej det er Emil" },
      { label: "2", start: 6, end: 6.2, text: "Ja" },
    ]);
  });
});

describe("identifyAgentLabel", () => {
  const seg = (label: string, start: number, end: number, text: string): LabeledSegment => ({ label, start, end, text });

  it("finder sælgeren, der præsenterer sig fra Allio, selv om kunden taler først", () => {
    const segments = [
      seg("1", 0.5, 1.8, "Hej, det er Sara."),
      seg("2", 1.9, 4.7, "Hej Sara, det er Emil inde fra Allio."),
      seg("1", 6.2, 6.6, "Fra hvad?"),
      seg("2", 7.5, 11.3, "Fra Allio. Du har tidligere været i dialog med os."),
    ];
    expect(identifyAgentLabel(segments, "Emil")).toBe("2");
  });

  it("bruger taletid, når der ikke er sælgertegn", () => {
    const segments = [seg("1", 0.5, 1, "Ja?"), seg("2", 2, 30, "Jeg vil gerne høre om jeres klinik og kunder.")];
    expect(identifyAgentLabel(segments, null)).toBe("2");
  });

  it("sælgerens præsentation vejer tungere end kunden, der gentager «Allio» og taler mest", () => {
    const segments = [
      seg("1", 1, 3, "Kosmøge 7, Klaus, med Lika."),
      seg("2", 3.5, 5, "Hej, er det med Lika?"),
      seg("1", 5.2, 5.6, "Ja."),
      seg("2", 6, 8.5, "Ja, det er Emil fra Allio."),
      seg("1", 9, 16, "Allio og Allio, ja. Ved du hvad, vi har faktisk også en... var det Viktor?"),
      seg("1", 18, 40, "Jeg har travlt her for tiden, og så kunne vi ikke nå at opsætte det hele."),
    ];
    expect(identifyAgentLabel(segments, "Emil")).toBe("2");
  });

  it("forveksler ikke sælgerens navn med et længere navn hos kunden", () => {
    const segments = [
      seg("1", 0, 2, "Hej, det er Emilie fra Emilikke."),
      seg("2", 2.5, 9, "Hej Emilie, du taler med Emil. Jeg håber, jeg kan tage 2 minutter af din tid."),
      seg("1", 11, 12, "Hvad drejer det sig om?"),
    ];
    expect(identifyAgentLabel(segments, "Emil")).toBe("2");
  });

  it("kun én taler uden sælgertegn kan ikke afgøres", () => {
    expect(identifyAgentLabel([seg("1", 0, 5, "Du har ringet til klinikken, læg en besked.")], null)).toBeNull();
    expect(identifyAgentLabel([seg("1", 0, 5, "Hej, det er Mali fra Allio, jeg ringer lige.")], "Mali")).toBe("1");
  });
});

describe("assignRoles + hjælpere", () => {
  const labeled: LabeledSegment[] = [
    { label: "1", start: 0, end: 1, text: "Hallo?" },
    { label: "2", start: 2, end: 6, text: "Det er Emil fra Allio" },
    { label: null, start: 7, end: 8, text: "mm" },
  ];

  it("fordeler sælger/kunde/ukendt og tæller taletid og ord", () => {
    const segs = assignRoles(labeled, "2");
    expect(segs.map((s) => s.speaker)).toEqual(["customer", "agent", "unknown"]);
    expect(talkSeconds(segs, "agent")).toBe(4);
    expect(talkSeconds(segs, "customer")).toBe(1);
    expect(wordCount(segs)).toBe(7);
    expect(assignRoles(labeled, null).every((s) => s.speaker === "unknown")).toBe(true);
  });

  it("sorterer segmenter fra to kanaler efter tid og finder dominerende sprog", () => {
    const merged = sortSegments([
      { speaker: "agent", start: 3, end: 4, text: "b" },
      { speaker: "customer", start: 1, end: 2, text: "a" },
    ]);
    expect(merged.map((s) => s.text)).toEqual(["a", "b"]);
    expect(dominantLanguage({ da: 120, en: 3 })).toBe("da");
    expect(dominantLanguage({})).toBeNull();
  });
});
