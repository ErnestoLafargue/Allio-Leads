/**
 * Måler live-coachens lag 1 mod de analyserede samtaler: træfsikkerhed pr. indvendingskategori
 * (kundens ordrette citater) og falske alarmer i kundereplikker uden indvending.
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/live-coach-trigger-eval.ts
 */
import { prisma } from "@/lib/prisma";
import type { StoredCallAnalysis } from "@/lib/call-analysis/schema";
import type { TranscriptSegment } from "@/lib/call-transcription/segments";
import { detectObjection } from "@/lib/live-coach/triggers";
(async () => {
  const rows = await prisma.callAnalysis.findMany({ select: { callRecordingId: true, result: true } });
  const per: Record<string, { n: number; hit: number; wrong: number }> = {};
  const objSegs = new Set<string>();
  for (const r of rows) {
    const a = r.result as unknown as StoredCallAnalysis;
    for (const o of a.objections ?? []) {
      objSegs.add(`${r.callRecordingId}:${o.customer.seg}`);
      const p = (per[o.category] ??= { n: 0, hit: 0, wrong: 0 });
      p.n++;
      const d = detectObjection(o.customer.quote);
      if (d?.category === o.category) p.hit++; else if (d) p.wrong++;
    }
  }
  console.table(Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { ...v, recall: (v.hit / v.n).toFixed(2) }])));
  // falske alarmer: kundesegmenter uden indvending
  const ts = await prisma.callTranscript.findMany({ select: { callRecordingId: true, segments: true } });
  let segs = 0, fa = 0; const cats: Record<string, number> = {};
  for (const t of ts) (t.segments as unknown as TranscriptSegment[]).forEach((s, i) => {
    if (s.speaker !== "customer" || objSegs.has(`${t.callRecordingId}:${i}`)) return;
    segs++; const d = detectObjection(s.text); if (d) { fa++; cats[d.category] = (cats[d.category] ?? 0) + 1; }
  });
  console.log("kundesegmenter uden indvending:", segs, "falske alarmer:", fa, JSON.stringify(cats));
  await prisma.$disconnect();
})();
