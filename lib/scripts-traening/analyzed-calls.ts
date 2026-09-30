/**
 * Indlæser analyserede samtaler (aktuel analyseversion) — uden auth, så både sider (via queries.ts)
 * og scripts/worker kan bruge den.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPATIBLE_ANALYSIS_VERSIONS } from "@/lib/call-analysis/prompt";
import type { CallScores } from "@/lib/call-analysis/score";
import type { StoredCallAnalysis } from "@/lib/call-analysis/schema";
import type { AnalyzedCall } from "./insights";

/** Nyeste analyse pr. samtale (kompatible versioner) — fx API-analysen frem for sessionens. */
export async function loadAnalyzedCalls(where: Prisma.CallRecordingWhereInput): Promise<AnalyzedCall[]> {
  const rows = await prisma.callAnalysis.findMany({
    where: { analysisVersion: { in: COMPATIBLE_ANALYSIS_VERSIONS }, callRecording: where },
    orderBy: { createdAt: "desc" },
    select: {
      callRecordingId: true,
      result: true,
      scores: true,
      callRecording: {
        select: {
          agentUserId: true,
          outcomeStatus: true,
          durationSeconds: true,
          startedAt: true,
          agent: { select: { name: true } },
        },
      },
    },
  });
  const seen = new Set<string>();
  const out: AnalyzedCall[] = [];
  for (const r of rows) {
    if (seen.has(r.callRecordingId)) continue;
    seen.add(r.callRecordingId);
    out.push({
      callRecordingId: r.callRecordingId,
      agentUserId: r.callRecording.agentUserId,
      agentName: r.callRecording.agent?.name ?? null,
      outcomeStatus: r.callRecording.outcomeStatus,
      durationSeconds: r.callRecording.durationSeconds,
      startedAt: r.callRecording.startedAt,
      result: r.result as unknown as StoredCallAnalysis,
      scores: r.scores as unknown as CallScores,
    });
  }
  return out;
}
