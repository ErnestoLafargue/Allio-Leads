/**
 * Evidenspakken til ugens script: hvad adskiller samtaler med booket møde fra dem uden — med
 * antal, bookingrater og konkrete eksempler (citat + samtale + tidspunkt). Kun data, ingen tekst:
 * modellen skriver scriptet ud fra pakken og må kun henvise til samtaler, der står i den.
 */
import {
  MIN_GROUP,
  isBooked,
  isLearnable,
  metricComparison,
  objectionStats,
  phaseStats,
  pitchStats,
  signalStats,
  type AnalyzedCall,
} from "@/lib/scripts-traening/insights";

type Example = { callRecordingId: string; t: number; quote: string; title?: string };

export type EvidencePack = ReturnType<typeof buildEvidencePack>;

export function buildEvidencePack(calls: readonly AnalyzedCall[]) {
  const learnable = calls.filter(isLearnable);
  const booked = learnable.filter(isBooked);
  const dates = learnable.map((c) => c.startedAt.getTime());
  const example = (c: AnalyzedCall, e: { t: number; quote: string }, title?: string): Example => ({
    callRecordingId: c.callRecordingId,
    t: Math.round(e.t),
    quote: e.quote,
    ...(title ? { title } : {}),
  });

  const objectionPlays = objectionStats(calls).map((o) => {
    const inCalls = learnable.flatMap((c) => c.result.objections.filter((x) => x.category === o.key).map((x) => ({ c, x })));
    const best = inCalls
      .filter(({ c, x }) => isBooked(c) && x.handling === "strong" && x.response)
      .slice(0, 4)
      .map(({ c, x }) => ({ customer: x.customer.quote, response: example(c, x.response!) }));
    const weak = inCalls
      .filter(({ x }) => x.handling === "weak" || x.handling === "none")
      .slice(0, 2)
      .map(({ c, x }) => ({ customer: x.customer.quote, response: x.response ? example(c, x.response) : null }));
    return { category: o.key, n: o.n, bookingRate: o.rate, enoughData: o.enoughData, byHandling: o.byHandling, best, weak };
  });

  const strongInBooked = booked
    .flatMap((c) => c.result.moments.filter((m) => m.kind === "strong").map((m) => example(c, m.evidence, m.title)))
    .slice(0, 25);
  const missedCounts = new Map<string, { n: number; examples: Example[]; betterLines: string[] }>();
  for (const c of learnable) {
    for (const m of c.result.moments.filter((x) => x.kind === "missed")) {
      const key = m.title.toLowerCase();
      const entry = missedCounts.get(key) ?? { n: 0, examples: [], betterLines: [] };
      entry.n += 1;
      if (entry.examples.length < 2) entry.examples.push(example(c, m.evidence, m.title));
      if (m.betterLine && entry.betterLines.length < 2) entry.betterLines.push(m.betterLine);
      missedCounts.set(key, entry);
    }
  }

  return {
    minGroup: MIN_GROUP,
    period: {
      from: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null,
      to: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null,
    },
    totals: {
      salesConversations: learnable.length,
      booked: booked.length,
      bookingRate: learnable.length ? booked.length / learnable.length : null,
    },
    pitches: pitchStats(calls),
    phases: phaseStats(calls),
    metrics: metricComparison(calls),
    signals: signalStats(calls),
    objections: objectionPlays,
    strongMomentsInBookedCalls: strongInBooked,
    frequentMissedMoments: [...missedCounts.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 12)
      .map(([title, v]) => ({ title, ...v })),
  };
}

/** Alle samtale-id'er, der optræder i pakken — kun dem må scriptet henvise til. */
export function evidenceCallIds(pack: EvidencePack): Set<string> {
  const ids = new Set<string>();
  const add = (e: { callRecordingId: string } | null | undefined) => e && ids.add(e.callRecordingId);
  pack.strongMomentsInBookedCalls.forEach(add);
  pack.frequentMissedMoments.forEach((m) => m.examples.forEach(add));
  pack.objections.forEach((o) => {
    o.best.forEach((b) => add(b.response));
    o.weak.forEach((w) => add(w.response));
  });
  return ids;
}
