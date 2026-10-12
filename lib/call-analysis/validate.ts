/**
 * Validering af modeloutput mod skemaet og mod transskriptionen (evidensprincippet):
 * hvert citat skal kunne genfindes i det angivne segment (eller et nabosegment, hvis modellen
 * ramte ved siden af). Citater, der ikke kan genfindes, fjernes — og det noteres som advarsel.
 */
import type { TranscriptSegment } from "@/lib/call-transcription/segments";
import {
  CallAnalysisSchema,
  type CallAnalysisOutput,
  type EvidenceRef,
  type ResolvedEvidence,
  type StoredCallAnalysis,
} from "./schema";

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Er citatet (tilnærmelsesvis) ordret en del af segmentet? */
export function quoteMatches(quote: string, segmentText: string): boolean {
  const q = normalizeText(quote);
  const s = normalizeText(segmentText);
  if (!q) return false;
  if (s.includes(q)) return true;
  const qTokens = q.split(" ");
  if (qTokens.length < 2) return false;
  const sTokens = new Set(s.split(" "));
  return qTokens.filter((t) => sTokens.has(t)).length / qTokens.length >= 0.75;
}

const NEIGHBOUR_RANGE = 3;

export function resolveEvidence(ev: EvidenceRef, segments: readonly TranscriptSegment[]): ResolvedEvidence | null {
  const candidates = [ev.seg];
  for (let d = 1; d <= NEIGHBOUR_RANGE; d++) candidates.push(ev.seg - d, ev.seg + d);
  for (const seg of candidates) {
    const s = segments[seg];
    if (s && quoteMatches(ev.quote, s.text)) return { seg, quote: ev.quote, t: s.start };
  }
  return null;
}

export type ValidationResult = { analysis: StoredCallAnalysis; warnings: string[] };

export function validateAnalysis(raw: unknown, segments: readonly TranscriptSegment[]): ValidationResult {
  const parsed: CallAnalysisOutput = CallAnalysisSchema.parse(raw);
  const warnings: string[] = [];
  const resolve = (ev: EvidenceRef, where: string): ResolvedEvidence | null => {
    const r = resolveEvidence(ev, segments);
    if (!r) warnings.push(`${where}: citatet findes ikke omkring segment ${ev.seg} ("${ev.quote.slice(0, 60)}")`);
    return r;
  };
  const keep = <T>(items: (T | null)[]): T[] => items.filter((x): x is T => x !== null);

  const phases = parsed.phases.map((p, i) => {
    const evidence = keep(p.evidence.map((e, j) => resolve(e, `phases[${i}].evidence[${j}]`)));
    const startT = p.startSeg !== null && segments[p.startSeg] ? segments[p.startSeg]!.start : (evidence[0]?.t ?? null);
    return { ...p, evidence, startT };
  });

  const analysis: StoredCallAnalysis = {
    ...parsed,
    pitch: {
      version: parsed.pitch.version,
      evidence: keep(parsed.pitch.evidence.map((e, j) => resolve(e, `pitch.evidence[${j}]`))),
    },
    phases,
    objections: keep(
      parsed.objections.map((o, i) => {
        const customer = resolve(o.customer, `objections[${i}].customer`);
        if (!customer) return null;
        const response = o.response ? resolve(o.response, `objections[${i}].response`) : null;
        return { ...o, customer, response };
      }),
    ),
    customerSignals: keep(
      parsed.customerSignals.map((c, i) => {
        const evidence = resolve(c.evidence, `customerSignals[${i}]`);
        return evidence ? { ...c, evidence } : null;
      }),
    ),
    moments: keep(
      parsed.moments.map((m, i) => {
        const evidence = resolve(m.evidence, `moments[${i}]`);
        return evidence ? { ...m, evidence } : null;
      }),
    ),
    closeAttempts: keep(
      parsed.closeAttempts.map((c, i) => {
        const evidence = resolve(c.evidence, `closeAttempts[${i}]`);
        return evidence ? { ...c, evidence } : null;
      }),
    ),
    nextStep: {
      ...parsed.nextStep,
      evidence: parsed.nextStep.evidence ? resolve(parsed.nextStep.evidence, "nextStep") : null,
    },
  };
  return { analysis, warnings };
}
