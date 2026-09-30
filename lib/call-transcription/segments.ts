/**
 * Ren (DB-fri) logik: tokens → segmenter, hvem er sælgeren i en mono-optagelse, taletid m.m.
 */
export type Speaker = "agent" | "customer" | "unknown";

export type TranscriptSegment = { speaker: Speaker; start: number; end: number; text: string };

/** Segment med udbyderens råt talerlabel (fx Soniox "1"/"2"), før roller er fordelt. */
export type LabeledSegment = { label: string | null; start: number; end: number; text: string };

export type TimedToken = { text: string; startMs: number; endMs: number; label?: string | null };

/** Tokens → segmenter: nyt segment ved talerskift eller pause > maxGapSec. Tokens bærer selv mellemrum. */
export function groupTokens(tokens: readonly TimedToken[], maxGapSec = 1.2): LabeledSegment[] {
  const out: LabeledSegment[] = [];
  for (const t of tokens) {
    const start = t.startMs / 1000;
    const end = t.endMs / 1000;
    const label = t.label ?? null;
    const cur = out[out.length - 1];
    if (cur && cur.label === label && start - cur.end <= maxGapSec) {
      cur.text += t.text;
      cur.end = Math.max(cur.end, end);
    } else {
      out.push({ label, start, end, text: t.text });
    }
  }
  return out
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim(), start: round2(s.start), end: round2(s.end) }))
    .filter((s) => s.text.length > 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const ALLIO = /\bal+i+o\b/gi;
const FROM_ALLIO = /\bfra\s+al+i+o\b/i;
const SELLER_PHRASES = /\b(m[øo]debooker|jeg ringer|ringer (lige )?(inde )?fra|ringer ud til)\b/i;

/**
 * Styrken af en sælgerpræsentation i én replik: "fra Allio" (3) og præsentation med sælgerens eget
 * navn — "det er Emil", "du taler med Emil" (6). Kunden gentager ofte "Allio", men præsenterer sig
 * ikke som sælgeren.
 */
export function sellerIntroStrength(text: string, agentFirstName: string | null): number {
  const t = text.toLowerCase();
  const name = agentFirstName?.trim().toLowerCase();
  let n = FROM_ALLIO.test(t) ? 3 : 0;
  if (name && new RegExp(`\\b(det er|du taler med|mit navn er|jeg hedder|her er)\\s+(bare\\s+)?${escapeRegExp(name)}\\b`).test(t)) {
    n += 6;
  }
  return n;
}

/**
 * Hvem er sælgeren i en mono-optagelse? Udgående opkald: kunden svarer typisk først ("Hallo?"),
 * sælgeren præsenterer sig ("det er Emil inde fra Allio") og taler mest. Præsentationen vejer
 * tungest (sellerIntroStrength).
 * Returnerer null, når det ikke kan afgøres (fx kun én taler uden sælgertegn).
 */
export function identifyAgentLabel(segments: readonly LabeledSegment[], agentFirstName: string | null): string | null {
  const labels = [...new Set(segments.map((s) => s.label).filter((l): l is string => l !== null))];
  if (labels.length === 0) return null;
  const name = agentFirstName?.trim().toLowerCase() || null;
  const talk = new Map(labels.map((l) => [l, 0]));
  const score = new Map(labels.map((l) => [l, 0]));
  for (const s of segments) {
    if (s.label === null) continue;
    talk.set(s.label, (talk.get(s.label) ?? 0) + (s.end - s.start));
    if (s.start > 120) continue;
    const text = s.text.toLowerCase();
    const allio = text.match(ALLIO)?.length ?? 0;
    let add = Math.min(allio, 2) + sellerIntroStrength(text, name);
    if (SELLER_PHRASES.test(text)) add += 2;
    if (name && s.start <= 60 && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text)) add += 1;
    score.set(s.label, (score.get(s.label) ?? 0) + add);
  }
  const first = segments.find((s) => s.label !== null);
  if (first?.label && first.start < 4) score.set(first.label, (score.get(first.label) ?? 0) - 1);
  const mostTalk = [...talk.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (mostTalk && labels.length > 1) score.set(mostTalk, (score.get(mostTalk) ?? 0) + 1);

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || (talk.get(b[0]) ?? 0) - (talk.get(a[0]) ?? 0));
  const [best, bestScore] = ranked[0]!;
  if (labels.length === 1) return bestScore >= 2 ? best : null;
  return best;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assignRoles(segments: readonly LabeledSegment[], agentLabel: string | null): TranscriptSegment[] {
  return segments.map((s) => ({
    speaker: agentLabel === null || s.label === null ? "unknown" : s.label === agentLabel ? "agent" : "customer",
    start: s.start,
    end: s.end,
    text: s.text,
  }));
}

export function sortSegments(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  return [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function talkSeconds(segments: readonly TranscriptSegment[], speaker: Speaker): number {
  return round2(segments.filter((s) => s.speaker === speaker).reduce((sum, s) => sum + (s.end - s.start), 0));
}

export function wordCount(segments: readonly TranscriptSegment[]): number {
  return segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
}

export function dominantLanguage(counts: Readonly<Record<string, number>>): string | null {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}
