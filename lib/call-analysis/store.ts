/**
 * Input til og lagring af analysen — fælles for Claude-sessionen (historikken) og workeren (API).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TranscriptSegment } from "@/lib/call-transcription/segments";
import { ANALYSIS_VERSION, buildAnalysisUserMessage } from "./prompt";
import { scoreAnalysis } from "./score";
import { validateAnalysis } from "./validate";

export type AnalysisSource = "session" | "api";

export async function loadAnalysisInput(callRecordingId: string): Promise<{ userMessage: string; segments: TranscriptSegment[] }> {
  const rec = await prisma.callRecording.findUniqueOrThrow({
    where: { id: callRecordingId },
    select: {
      id: true,
      startedAt: true,
      direction: true,
      durationSeconds: true,
      agent: { select: { name: true } },
      transcript: { select: { segments: true, language: true } },
    },
  });
  if (!rec.transcript) throw new Error(`Samtalen ${callRecordingId} er ikke transskriberet.`);
  const segments = rec.transcript.segments as unknown as TranscriptSegment[];
  const userMessage = buildAnalysisUserMessage({
    callRecordingId: rec.id,
    startedAt: rec.startedAt,
    agentName: rec.agent?.name ?? null,
    direction: rec.direction,
    durationSeconds: rec.durationSeconds,
    language: rec.transcript.language,
    segments,
  });
  return { userMessage, segments };
}

/** Validerer (skema + citater), beregner scorer og gemmer analysen; samtalen får status ANALYZED. */
export async function saveCallAnalysis(params: {
  callRecordingId: string;
  raw: unknown;
  source: AnalysisSource;
  model: string;
  /** Standard: aktuel version. Angiv fx "v1" ved import af analyser lavet med en ældre prompt. */
  analysisVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}): Promise<{ overall: number | null; warnings: string[] }> {
  const transcript = await prisma.callTranscript.findUniqueOrThrow({
    where: { callRecordingId: params.callRecordingId },
    select: { segments: true },
  });
  const segments = transcript.segments as unknown as TranscriptSegment[];
  const { analysis, warnings } = validateAnalysis(params.raw, segments);
  const scores = scoreAnalysis(analysis, segments);
  const analysisVersion = params.analysisVersion ?? ANALYSIS_VERSION;
  const data = {
    model: params.model,
    result: analysis as unknown as Prisma.InputJsonValue,
    scores: scores as unknown as Prisma.InputJsonValue,
    overallScore: scores.overall,
    warnings,
    inputTokens: params.inputTokens ?? null,
    outputTokens: params.outputTokens ?? null,
    costUsd: params.costUsd ?? 0,
  };
  await prisma.$transaction([
    prisma.callAnalysis.upsert({
      where: {
        callRecordingId_analysisVersion_source: {
          callRecordingId: params.callRecordingId,
          analysisVersion,
          source: params.source,
        },
      },
      create: {
        callRecordingId: params.callRecordingId,
        analysisVersion,
        source: params.source,
        ...data,
      },
      update: data,
    }),
    prisma.callRecording.update({
      where: { id: params.callRecordingId },
      data: { pipelineStatus: "ANALYZED", pipelineError: null },
    }),
  ]);
  return { overall: scores.overall, warnings };
}
