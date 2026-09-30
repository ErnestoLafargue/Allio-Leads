/**
 * Retter mono-transskriptioner, hvor sælger og kunde er byttet om: kun når sælgerens egen præsentation
 * ("det er Emil fra Allio") står hos "kunden" i de første 2 minutter og ikke hos "sælgeren"
 * (sellerIntroStrength i lib/call-transcription/segments.ts). Taletid og scorer for eksisterende
 * analyser genberegnes. Samtaler, der allerede er analyseret med byttede roller, listes, så de kan
 * analyseres igen.
 *
 * Tørkørsel som standard; --apply skriver.
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/fix-speaker-roles.ts [--apply]
 */
import type { Prisma } from "@prisma/client";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { scoreAnalysis } from "@/lib/call-analysis/score";
import type { StoredCallAnalysis } from "@/lib/call-analysis/schema";
import { sellerIntroStrength, talkSeconds, type TranscriptSegment } from "@/lib/call-transcription/segments";

const swapRole = (s: TranscriptSegment): TranscriptSegment => ({
  ...s,
  speaker: s.speaker === "agent" ? "customer" : s.speaker === "customer" ? "agent" : s.speaker,
});

async function main() {
  assertExpectedDatabase();
  const apply = process.argv.includes("--apply");
  const rows = await prisma.callTranscript.findMany({
    where: { mode: "mono_diarized" },
    select: {
      id: true,
      callRecordingId: true,
      segments: true,
      callRecording: { select: { agent: { select: { name: true } }, analyses: { select: { id: true, result: true } } } },
    },
  });
  const flipped: string[] = [];
  const reanalyze: string[] = [];
  for (const r of rows) {
    const segments = r.segments as unknown as TranscriptSegment[];
    if (!segments.some((s) => s.speaker === "agent") || !segments.some((s) => s.speaker === "customer")) continue;
    const firstName = r.callRecording.agent?.name?.split(/\s+/)[0] ?? null;
    const intro = (speaker: "agent" | "customer") =>
      segments
        .filter((s) => s.speaker === speaker && s.start < 120)
        .reduce((max, s) => Math.max(max, sellerIntroStrength(s.text, firstName)), 0);
    if (!(intro("customer") >= 6 && intro("agent") < 6)) continue;

    flipped.push(r.callRecordingId);
    if (r.callRecording.analyses.length) reanalyze.push(r.callRecordingId);
    if (!apply) continue;
    const fixed = segments.map(swapRole);
    await prisma.$transaction([
      prisma.callTranscript.update({
        where: { id: r.id },
        data: {
          segments: fixed as unknown as Prisma.InputJsonValue,
          agentTalkSeconds: talkSeconds(fixed, "agent"),
          customerTalkSeconds: talkSeconds(fixed, "customer"),
        },
      }),
      ...r.callRecording.analyses.map((a) => {
        const scores = scoreAnalysis(a.result as unknown as StoredCallAnalysis, fixed);
        return prisma.callAnalysis.update({
          where: { id: a.id },
          data: { scores: scores as unknown as Prisma.InputJsonValue, overallScore: scores.overall },
        });
      }),
    ]);
  }
  console.log(`${rows.length} mono-transskriptioner · ${flipped.length} får byttet sælger/kunde${apply ? "" : " (tørkørsel)"}`);
  console.log(`Byttet: ${flipped.join(",") || "ingen"}`);
  console.log(`Allerede analyseret (bør analyseres igen): ${reanalyze.join(",") || "ingen"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
