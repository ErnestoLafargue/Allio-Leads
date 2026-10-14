/**
 * Samler alle indvendinger fra de analyserede samtaler med kontekst: sælgerens svar, kundens reaktion
 * lige efter, og om samtalen endte med et møde. Ren logik (statistik, udvælgelse af eksempler) er
 * adskilt fra databasen, så den kan testes.
 */
import { prisma } from "@/lib/prisma";
import type { TranscriptSegment } from "@/lib/call-transcription/segments";
import { loadAnalyzedCalls } from "@/lib/scripts-traening/analyzed-calls";
import type { PlaybookExample } from "./schema";

export type CollectedObjection = PlaybookExample & { category: string; note: string; agentUserId: string | null };

const clipWords = (text: string, n: number) => {
  const words = text.trim().split(/\s+/);
  return words.length > n ? `${words.slice(0, n).join(" ")} …` : text.trim();
};

/** Kundens næste ord efter sælgerens svar (op til 2 segmenter, ca. 45 ord). */
export function reactionAfter(segments: readonly TranscriptSegment[], afterSeg: number): string | null {
  const next = segments.slice(afterSeg + 1).filter((s) => s.speaker === "customer").slice(0, 2);
  // Kun reaktioner inden for kort tid — ellers er det en anden del af samtalen.
  const start = segments[afterSeg]?.end ?? 0;
  const close = next.filter((s) => s.start - start < 25);
  return close.length ? clipWords(close.map((s) => s.text).join(" "), 45) : null;
}

export async function collectObjections(): Promise<{ objections: CollectedObjection[]; calls: number }> {
  const calls = (await loadAnalyzedCalls({})).filter((c) => c.result.isSalesConversation);
  const transcripts = await prisma.callTranscript.findMany({
    where: { callRecordingId: { in: calls.map((c) => c.callRecordingId) } },
    select: { callRecordingId: true, segments: true },
  });
  const segmentsBy = new Map(transcripts.map((t) => [t.callRecordingId, t.segments as unknown as TranscriptSegment[]]));
  const out: CollectedObjection[] = [];
  for (const c of calls) {
    const segments = segmentsBy.get(c.callRecordingId) ?? [];
    const booked = c.outcomeStatus === "MEETING_BOOKED" || c.result.nextStep?.type === "meeting_booked";
    c.result.objections.forEach((o, i) => {
      const afterSeg = o.response?.seg ?? o.customer.seg;
      out.push({
        id: `${c.callRecordingId}:${i}`,
        callRecordingId: c.callRecordingId,
        agentUserId: c.agentUserId,
        t: o.customer.t,
        category: o.category,
        customer: clipWords(o.customer.quote, 40),
        response: o.response ? clipWords(o.response.quote, 45) : null,
        reaction: reactionAfter(segments, afterSeg),
        handling: o.handling,
        note: o.note,
        booked,
      });
    });
  }
  return { objections: out, calls: calls.length };
}

const GOOD = new Set(["strong", "ok"]);
const MIN_FOR_RATE = 5;

/** Bookingrate ved god og dårlig behandling (null, når der er for få til at sige noget). */
export function bookingRates(items: readonly Pick<CollectedObjection, "handling" | "booked">[]) {
  const good = items.filter((o) => GOOD.has(o.handling));
  const bad = items.filter((o) => !GOOD.has(o.handling));
  const rate = (xs: typeof items) => (xs.length >= MIN_FOR_RATE ? xs.filter((o) => o.booked).length / xs.length : null);
  return { bookedGood: rate(good), bookedBad: rate(bad), nGood: good.length, nBad: bad.length };
}

const HANDLING_RANK: Record<string, number> = { strong: 0, ok: 1, weak: 2, none: 3 };

/** Kandidater til «bedste»: godt behandlet, helst med møde og en reaktion at vurdere ud fra. */
export function bestCandidates<T extends Pick<CollectedObjection, "handling" | "booked" | "response" | "reaction">>(items: readonly T[], n = 8): T[] {
  return items
    .filter((o) => o.response && GOOD.has(o.handling))
    .sort((a, b) => Number(b.booked) - Number(a.booked) || HANDLING_RANK[a.handling]! - HANDLING_RANK[b.handling]! || Number(!!b.reaction) - Number(!!a.reaction))
    .slice(0, n);
}

/** Kandidater til «dårligste»: svagt eller ikke behandlet, uden møde. */
export function worstCandidates<T extends Pick<CollectedObjection, "handling" | "booked" | "response" | "reaction">>(items: readonly T[], n = 6): T[] {
  return items
    .filter((o) => !GOOD.has(o.handling) && !o.booked)
    .sort((a, b) => HANDLING_RANK[b.handling]! - HANDLING_RANK[a.handling]! || Number(!!b.response) - Number(!!a.response))
    .slice(0, n);
}
