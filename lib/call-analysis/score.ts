/**
 * Scorer beregnes af koden — ikke af modellen (evidensprincippet). Input er den validerede analyse
 * (fakta med citater) og transskriptionen (taletid, spørgsmål, monologer).
 */
import type { TranscriptSegment } from "@/lib/call-transcription/segments";
import { PHASES, type Phase, type StoredCallAnalysis } from "./schema";

const QUALITY_POINTS = { strong: 100, ok: 65, weak: 30 } as const;
const HANDLING_POINTS = { strong: 100, ok: 65, weak: 30, none: 0 } as const;
const OPEN_QUESTION = /^(hvad|hvordan|hvorfor|hvor|hvem|hvilke|hvilken|hvornår|what|how|why|where|who|which|when)\b/i;

export type CallMetrics = {
  agentTalkSeconds: number;
  customerTalkSeconds: number;
  /** Sælgerens andel af taletiden (0–1), null hvis ingen taletid */
  agentTalkRatio: number | null;
  agentQuestions: number;
  agentOpenQuestions: number;
  longestAgentMonologueSeconds: number;
};

export type CallScores = {
  metrics: CallMetrics;
  /** 0–100 pr. fase; null for faser, der ikke forventes i samtalen */
  phases: Record<Phase, number | null>;
  objectionHandling: number | null;
  metricScore: number;
  overall: number | null;
};

export function computeMetrics(segments: readonly TranscriptSegment[]): CallMetrics {
  let agent = 0;
  let customer = 0;
  let questions = 0;
  let open = 0;
  let longest = 0;
  let run = 0;
  for (const s of segments) {
    const d = Math.max(0, s.end - s.start);
    if (s.speaker === "agent") {
      agent += d;
      run += d;
      longest = Math.max(longest, run);
      for (const sentence of s.text.split(/(?<=[.?!])\s+/)) {
        if (!sentence.trim().endsWith("?")) continue;
        questions += 1;
        if (OPEN_QUESTION.test(sentence.trim().replace(/^(og|men|så|and|but|so)\s+/i, ""))) open += 1;
      }
    } else if (s.speaker === "customer") {
      customer += d;
      run = 0;
    }
  }
  const total = agent + customer;
  return {
    agentTalkSeconds: Math.round(agent),
    customerTalkSeconds: Math.round(customer),
    agentTalkRatio: total > 0 ? Math.round((agent / total) * 100) / 100 : null,
    agentQuestions: questions,
    agentOpenQuestions: open,
    longestAgentMonologueSeconds: Math.round(longest),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Taletid 45–65 % sælger, ≥ 4 åbne spørgsmål og monologer ≤ 45 s giver fuld metrik-score. */
export function metricScore(m: CallMetrics): number {
  const ratio =
    m.agentTalkRatio === null
      ? 0
      : m.agentTalkRatio < 0.45
        ? clamp(((m.agentTalkRatio - 0.25) / 0.2) * 100)
        : m.agentTalkRatio > 0.65
          ? clamp(((0.9 - m.agentTalkRatio) / 0.25) * 100)
          : 100;
  const questions = clamp((m.agentOpenQuestions / 4) * 100);
  const monologue = clamp(((120 - m.longestAgentMonologueSeconds) / 75) * 100);
  return Math.round((ratio + questions + monologue) / 3);
}

export function scoreAnalysis(analysis: StoredCallAnalysis, segments: readonly TranscriptSegment[]): CallScores {
  const metrics = computeMetrics(segments);
  const expectConfirmation = analysis.nextStep.type === "meeting_booked";
  const phases = Object.fromEntries(
    PHASES.map((phase) => {
      const p = analysis.phases.find((x) => x.phase === phase);
      const expected = phase !== "confirmation" || expectConfirmation;
      if (!expected) return [phase, null];
      return [phase, p?.present && p.quality ? QUALITY_POINTS[p.quality] : 0];
    }),
  ) as Record<Phase, number | null>;

  const objectionHandling = mean(analysis.objections.map((o) => HANDLING_POINTS[o.handling]));
  const ms = metricScore(metrics);
  const phaseAvg = mean(Object.values(phases).filter((v): v is number => v !== null)) ?? 0;
  const overall = analysis.isSalesConversation
    ? Math.round(0.6 * phaseAvg + 0.2 * (objectionHandling ?? phaseAvg) + 0.2 * ms)
    : null;
  return {
    metrics,
    phases,
    objectionHandling: objectionHandling === null ? null : Math.round(objectionHandling),
    metricScore: ms,
    overall,
  };
}
