import { describe, expect, it } from "vitest";
import type { TranscriptSegment } from "@/lib/call-transcription/segments";
import { analysisJsonSchema, PHASES } from "./schema";
import { computeMetrics, metricScore, scoreAnalysis } from "./score";
import { quoteMatches, resolveEvidence, validateAnalysis } from "./validate";

const segments: TranscriptSegment[] = [
  { speaker: "customer", start: 0.5, end: 1.8, text: "Hej, det er Sara." },
  { speaker: "agent", start: 1.9, end: 4.7, text: "Hej Sara, det er Emil inde fra Allio." },
  { speaker: "customer", start: 6.2, end: 6.6, text: "Fra hvad?" },
  { speaker: "agent", start: 7.5, end: 11.3, text: "Fra Allio. Hvor mange kunder har du liggende, som ikke er kommet igen?" },
  { speaker: "customer", start: 12, end: 14.2, text: "Det ved jeg faktisk ikke, men vi har allerede et bookingsystem." },
  { speaker: "agent", start: 15, end: 22, text: "Det giver god mening. Allio handler om det, der sker før og efter bookingen. Passer mandag eller onsdag?" },
];

function rawAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    language: "da",
    callType: "cold_call",
    isSalesConversation: true,
    summary: "Emil ringer til Sara og booker næsten et møde.",
    pitch: { version: "pitch_7", evidence: [{ seg: 1, quote: "det er Emil inde fra Allio" }] },
    phases: PHASES.map((phase) => ({
      phase,
      present: phase !== "confirmation",
      startSeg: phase === "opening" ? 1 : null,
      quality: phase === "confirmation" ? null : phase === "close" ? "ok" : "strong",
      evidence: phase === "opening" ? [{ seg: 1, quote: "Hej Sara, det er Emil" }] : [],
      note: "",
    })),
    objections: [
      {
        category: "has_booking_system",
        customer: { seg: 4, quote: "vi har allerede et bookingsystem" },
        response: { seg: 5, quote: "Allio handler om det, der sker før og efter bookingen" },
        handling: "strong",
        followsPreferredAnswer: true,
        note: "",
      },
    ],
    customerSignals: [{ signal: "klarhed", evidence: { seg: 2, quote: "Fra hvad?" }, addressedByAgent: true }],
    moments: [
      {
        kind: "strong",
        title: "Godt svar på bookingsystem",
        evidence: { seg: 5, quote: "Det giver god mening." },
        explanation: "Anerkender og omformulerer.",
        betterLine: null,
      },
      {
        kind: "missed",
        title: "Opdigtet citat",
        evidence: { seg: 2, quote: "vi køber gerne tre pakker med det samme" },
        explanation: "Findes ikke i samtalen.",
        betterLine: null,
      },
    ],
    closeAttempts: [{ evidence: { seg: 4, quote: "Passer mandag eller onsdag?" }, style: "alternative_choice" }],
    nextStep: { type: "callback", detail: null, evidence: null },
    ...overrides,
  };
}

describe("citat-validering", () => {
  it("genkender ordrette og næsten ordrette citater", () => {
    expect(quoteMatches("det er Emil inde fra Allio", segments[1]!.text)).toBe(true);
    expect(quoteMatches("Det er Emil fra Allio", segments[1]!.text)).toBe(true);
    expect(quoteMatches("vi køber gerne tre pakker", segments[1]!.text)).toBe(false);
  });

  it("retter et forkert segmentnummer til nabosegmentet og slår tiden op", () => {
    expect(resolveEvidence({ seg: 4, quote: "Passer mandag eller onsdag?" }, segments)).toEqual({
      seg: 5,
      quote: "Passer mandag eller onsdag?",
      t: 15,
    });
  });

  it("fjerner evidens, der ikke findes, og noterer det som advarsel", () => {
    const { analysis, warnings } = validateAnalysis(rawAnalysis(), segments);
    expect(analysis.moments).toHaveLength(1);
    expect(analysis.moments[0]!.evidence.t).toBe(15);
    expect(analysis.closeAttempts[0]!.evidence.seg).toBe(5);
    expect(analysis.phases.find((p) => p.phase === "opening")!.startT).toBe(1.9);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("moments[1]");
  });

  it("afviser output, der ikke følger skemaet", () => {
    expect(() => validateAnalysis(rawAnalysis({ language: "sv" }), segments)).toThrow();
  });

  it("kan eksporteres som JSON Schema til sessionen", () => {
    const schema = analysisJsonSchema() as { type: string; properties: Record<string, unknown> };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toContain("moments");
  });
});

describe("scorer beregnes af koden", () => {
  it("måler taletid, spørgsmål og monologer", () => {
    const m = computeMetrics(segments);
    expect(m.agentTalkSeconds).toBe(14);
    expect(m.customerTalkSeconds).toBe(4);
    expect(m.agentQuestions).toBe(2);
    expect(m.agentOpenQuestions).toBe(1);
    expect(m.longestAgentMonologueSeconds).toBe(7);
  });

  it("giver fuld metrik-score ved balanceret taletid, åbne spørgsmål og korte monologer", () => {
    expect(
      metricScore({
        agentTalkSeconds: 55,
        customerTalkSeconds: 45,
        agentTalkRatio: 0.55,
        agentQuestions: 6,
        agentOpenQuestions: 4,
        longestAgentMonologueSeconds: 30,
      }),
    ).toBe(100);
  });

  it("vægter faser, indvendinger og metrikker — og giver ingen totalscore uden salgssamtale", () => {
    const { analysis } = validateAnalysis(rawAnalysis(), segments);
    const scores = scoreAnalysis(analysis, segments);
    expect(scores.phases.confirmation).toBeNull();
    expect(scores.phases.close).toBe(65);
    expect(scores.objectionHandling).toBe(100);
    expect(scores.overall).toBeGreaterThan(0);
    const none = scoreAnalysis(validateAnalysis(rawAnalysis({ isSalesConversation: false }), segments).analysis, segments);
    expect(none.overall).toBeNull();
  });
});
