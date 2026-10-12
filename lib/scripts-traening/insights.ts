/**
 * Rene beregninger på analyserede samtaler: hvad hænger sammen med bookede møder, og hvad bør den
 * enkelte sælger træne. Ingen konklusioner på for få samtaler — grupper under minimum markeres.
 */
import type { CallScores } from "@/lib/call-analysis/score";
import { PHASES, type Phase, type StoredCallAnalysis } from "@/lib/call-analysis/schema";

/** Mindste antal samtaler, før en gruppe må sammenlignes (Indsigter / ugens script). */
export const MIN_GROUP = 10;
/** Mindste antal samtaler pr. dimension i træningen. */
export const MIN_TRAINING = 5;

export type AnalyzedCall = {
  callRecordingId: string;
  agentUserId: string | null;
  agentName: string | null;
  outcomeStatus: string | null;
  durationSeconds: number;
  startedAt: Date;
  result: StoredCallAnalysis;
  scores: CallScores;
};

export type GroupStat = { key: string; n: number; booked: number; rate: number | null; enoughData: boolean };

export const isBooked = (c: AnalyzedCall) => c.outcomeStatus === "MEETING_BOOKED";
/** Samtaler, der kan bruges til at lære af: en reel salgssamtale med et kendt udfald. */
export const isLearnable = (c: AnalyzedCall) => c.result.isSalesConversation && c.outcomeStatus !== null;

export function groupStats(calls: readonly AnalyzedCall[], keysOf: (c: AnalyzedCall) => string[]): GroupStat[] {
  const groups = new Map<string, { n: number; booked: number }>();
  for (const c of calls) {
    for (const key of new Set(keysOf(c))) {
      const g = groups.get(key) ?? { n: 0, booked: 0 };
      g.n += 1;
      if (isBooked(c)) g.booked += 1;
      groups.set(key, g);
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      n: g.n,
      booked: g.booked,
      rate: g.n > 0 ? g.booked / g.n : null,
      enoughData: g.n >= MIN_GROUP,
    }))
    .sort((a, b) => b.n - a.n);
}

export const pitchStats = (calls: readonly AnalyzedCall[]) => groupStats(calls.filter(isLearnable), (c) => [c.result.pitch.version]);

/** Indvendinger: hyppighed og bookingrate pr. håndtering (stærk/ok/svag/ingen). */
export function objectionStats(calls: readonly AnalyzedCall[]) {
  const learnable = calls.filter(isLearnable);
  const categories = groupStats(learnable, (c) => c.result.objections.map((o) => o.category));
  return categories.map((cat) => ({
    ...cat,
    byHandling: groupStats(
      learnable.filter((c) => c.result.objections.some((o) => o.category === cat.key)),
      (c) => c.result.objections.filter((o) => o.category === cat.key).map((o) => o.handling),
    ),
  }));
}

/** Kundesignaler: bookingrate når sælgeren tog hånd om signalet vs. ikke. */
export function signalStats(calls: readonly AnalyzedCall[]) {
  const learnable = calls.filter(isLearnable);
  return groupStats(learnable, (c) => c.result.customerSignals.map((s) => s.signal)).map((sig) => ({
    ...sig,
    byAddressed: groupStats(
      learnable.filter((c) => c.result.customerSignals.some((s) => s.signal === sig.key)),
      (c) => c.result.customerSignals.filter((s) => s.signal === sig.key).map((s) => (s.addressedByAgent ? "ja" : "nej")),
    ),
  }));
}

/** Fasekvalitet vs. booking: pr. fase, bookingrate når fasen var stærk / ok / svag / manglede. */
export function phaseStats(calls: readonly AnalyzedCall[]) {
  const learnable = calls.filter(isLearnable);
  return PHASES.filter((p) => p !== "confirmation").map((phase) => ({
    phase,
    byQuality: groupStats(learnable, (c) => {
      const p = c.result.phases.find((x) => x.phase === phase);
      return [p?.present && p.quality ? p.quality : "missing"];
    }),
  }));
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median-metrikker for bookede vs. ikke-bookede salgssamtaler. */
export function metricComparison(calls: readonly AnalyzedCall[]) {
  const learnable = calls.filter(isLearnable);
  const side = (xs: AnalyzedCall[]) => ({
    n: xs.length,
    enoughData: xs.length >= MIN_GROUP,
    overall: median(xs.map((c) => c.scores.overall).filter((v): v is number => v !== null)),
    talkRatio: median(xs.map((c) => c.scores.metrics.agentTalkRatio).filter((v): v is number => v !== null)),
    openQuestions: median(xs.map((c) => c.scores.metrics.agentOpenQuestions)),
    longestMonologue: median(xs.map((c) => c.scores.metrics.longestAgentMonologueSeconds)),
    closeAttempts: median(xs.map((c) => c.result.closeAttempts.length)),
  });
  return { booked: side(learnable.filter(isBooked)), notBooked: side(learnable.filter((c) => !isBooked(c))) };
}

export type FocusArea = { key: string; label: string; seller: number; benchmark: number; gap: number; n: number };

const PHASE_KEYS: Phase[] = ["opening", "qualification", "discovery", "solution", "close"];

/**
 * Træning: sælgerens gennemsnit pr. dimension (faser, indvendinger, metrik) mod benchmark
 * (samtaler der endte med møde). De tre største huller med nok data er fokusområderne.
 */
export function trainingFocus(
  sellerCalls: readonly AnalyzedCall[],
  benchmarkCalls: readonly AnalyzedCall[],
  phaseLabels: Record<Phase, string>,
): FocusArea[] {
  const sales = (xs: readonly AnalyzedCall[]) => xs.filter((c) => c.result.isSalesConversation);
  const mine = sales(sellerCalls);
  const bench = sales(benchmarkCalls);
  const avg = (xs: readonly AnalyzedCall[], f: (c: AnalyzedCall) => number | null) => {
    const vals = xs.map(f).filter((v): v is number => v !== null);
    return { value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  };
  const dims: { key: string; label: string; f: (c: AnalyzedCall) => number | null }[] = [
    ...PHASE_KEYS.map((p) => ({ key: `phase:${p}`, label: phaseLabels[p], f: (c: AnalyzedCall) => c.scores.phases[p] })),
    { key: "objections", label: "Håndtering af indvendinger", f: (c) => c.scores.objectionHandling },
    { key: "metrics", label: "Taletid, spørgsmål og monologer", f: (c) => c.scores.metricScore },
  ];
  return dims
    .map((d) => {
      const s = avg(mine, d.f);
      const b = avg(bench, d.f);
      if (s.value === null || b.value === null || s.n < MIN_TRAINING) return null;
      return {
        key: d.key,
        label: d.label,
        seller: Math.round(s.value),
        benchmark: Math.round(b.value),
        gap: Math.round(b.value - s.value),
        n: s.n,
      };
    })
    .filter((x): x is FocusArea => x !== null)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);
}
