import { describe, expect, it } from "vitest";
import type { CallScores } from "@/lib/call-analysis/score";
import type { Phase, StoredCallAnalysis } from "@/lib/call-analysis/schema";
import { groupStats, median, MIN_GROUP, MIN_TRAINING, phaseStats, trainingFocus, type AnalyzedCall } from "./insights";

const PHASE_LABELS: Record<Phase, string> = {
  opening: "Åbning",
  qualification: "Kvalificering",
  discovery: "Behovsafdækning",
  solution: "Løsning",
  close: "Close",
  confirmation: "Bekræftelse",
};

function call(over: {
  outcome?: string | null;
  sales?: boolean;
  pitch?: string;
  phases?: Partial<Record<Phase, number | null>>;
  presentPhases?: Phase[];
  objectionHandling?: number | null;
  metricScore?: number;
}): AnalyzedCall {
  const phases = { opening: 50, qualification: 50, discovery: 50, solution: 50, close: 50, confirmation: null, ...over.phases };
  return {
    callRecordingId: Math.random().toString(36).slice(2),
    agentUserId: "u1",
    agentName: "Sælger",
    outcomeStatus: over.outcome === undefined ? "MEETING_BOOKED" : over.outcome,
    durationSeconds: 300,
    startedAt: new Date("2026-09-01T10:00:00Z"),
    result: {
      isSalesConversation: over.sales ?? true,
      pitch: { version: over.pitch ?? "pitch_nynyny", evidence: [] },
      phases: (over.presentPhases ?? []).map((phase) => ({ phase, present: true, quality: "strong" })),
      objections: [],
      customerSignals: [],
      closeAttempts: [],
    } as unknown as StoredCallAnalysis,
    scores: {
      metrics: {} as CallScores["metrics"],
      phases,
      objectionHandling: over.objectionHandling ?? null,
      metricScore: over.metricScore ?? 50,
      overall: 50,
    },
  };
}

describe("groupStats", () => {
  it("tæller bookinger pr. gruppe og markerer grupper under minimum", () => {
    const calls = [
      ...Array.from({ length: MIN_GROUP }, (_, i) => call({ pitch: "pitch_7", outcome: i < 4 ? "MEETING_BOOKED" : "NOT_INTERESTED" })),
      call({ pitch: "pitch_6" }),
    ];
    const stats = groupStats(calls, (c) => [c.result.pitch.version]);
    expect(stats[0]).toMatchObject({ key: "pitch_7", n: MIN_GROUP, booked: 4, enoughData: true });
    expect(stats[0].rate).toBeCloseTo(4 / MIN_GROUP);
    expect(stats[1]).toMatchObject({ key: "pitch_6", n: 1, booked: 1, enoughData: false });
  });
});

describe("median", () => {
  it("håndterer tom, ulige og lige længde", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("phaseStats", () => {
  it("regner en fraværende fase som «missing» og udelader bekræftelse", () => {
    const stats = phaseStats([call({ presentPhases: ["opening"] }), call({ outcome: "NOT_INTERESTED" })]);
    expect(stats.map((s) => s.phase)).not.toContain("confirmation");
    const opening = stats.find((s) => s.phase === "opening")!;
    expect(opening.byQuality.map((g) => g.key).sort()).toEqual(["missing", "strong"]);
  });
});

describe("trainingFocus", () => {
  it("giver de tre største huller mod benchmark og ignorerer dimensioner med for få samtaler", () => {
    const seller = Array.from({ length: MIN_TRAINING }, () =>
      call({ outcome: "NOT_INTERESTED", phases: { opening: 20, discovery: 30, close: 40, solution: 70 }, objectionHandling: null }),
    );
    const bench = Array.from({ length: 3 }, () =>
      call({ phases: { opening: 80, discovery: 90, close: 60, solution: 70 }, objectionHandling: 90 }),
    );
    const focus = trainingFocus(seller, bench, PHASE_LABELS);
    expect(focus.map((f) => f.key)).toEqual(["phase:opening", "phase:discovery", "phase:close"]);
    expect(focus[0]).toMatchObject({ label: "Åbning", seller: 20, benchmark: 80, gap: 60, n: MIN_TRAINING });
    expect(focus.some((f) => f.key === "objections")).toBe(false);
  });

  it("returnerer intet, når sælgeren har for få salgssamtaler", () => {
    const seller = [call({ sales: false }), ...Array.from({ length: MIN_TRAINING - 1 }, () => call({}))];
    expect(trainingFocus(seller, [call({})], PHASE_LABELS)).toEqual([]);
  });
});
