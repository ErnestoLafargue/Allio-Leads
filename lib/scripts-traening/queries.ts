/**
 * Datalag (server) for «Scripts & Træning». Adgang: sælgere ser kun egne samtaler; admins ser alle
 * (og kan filtrere på én sælger).
 */
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { COMPATIBLE_ANALYSIS_VERSIONS } from "@/lib/call-analysis/prompt";
import type { CallScores } from "@/lib/call-analysis/score";
import type { StoredCallAnalysis } from "@/lib/call-analysis/schema";
import type { TranscriptSegment } from "@/lib/call-transcription/segments";

export type Viewer = { userId: string; isAdmin: boolean; name: string };

export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { userId: session.user.id, isAdmin: session.user.role === "ADMIN", name: session.user.name ?? "" };
}

export function callScope(viewer: Viewer, sellerId?: string | null): Prisma.CallRecordingWhereInput {
  if (!viewer.isAdmin) return { agentUserId: viewer.userId };
  return sellerId ? { agentUserId: sellerId } : {};
}

export { loadAnalyzedCalls } from "./analyzed-calls";

export async function listSellers(): Promise<{ id: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: { callRecordings: { some: { analyses: { some: {} } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name }));
}

export const CALLS_PAGE_SIZE = 40;

export async function listCalls(params: {
  where: Prisma.CallRecordingWhereInput;
  outcome?: string | null;
  analyzedOnly: boolean;
  page: number;
}) {
  const where: Prisma.CallRecordingWhereInput = {
    ...params.where,
    pipelineStatus: params.analyzedOnly ? "ANALYZED" : { in: ["TRANSCRIBED", "ANALYZED"] },
    ...(params.outcome === "NONE"
      ? { outcomeStatus: null }
      : params.outcome
        ? { outcomeStatus: params.outcome }
        : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.callRecording.count({ where }),
    prisma.callRecording.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (params.page - 1) * CALLS_PAGE_SIZE,
      take: CALLS_PAGE_SIZE,
      select: {
        id: true,
        startedAt: true,
        durationSeconds: true,
        outcomeStatus: true,
        pipelineStatus: true,
        agent: { select: { name: true } },
        lead: { select: { companyName: true } },
        analyses: {
          where: { analysisVersion: { in: COMPATIBLE_ANALYSIS_VERSIONS } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { overallScore: true, result: true },
        },
      },
    }),
  ]);
  return {
    total,
    rows: rows.map((r) => {
      const a = r.analyses[0];
      const result = a?.result as unknown as StoredCallAnalysis | undefined;
      return {
        id: r.id,
        startedAt: r.startedAt,
        durationSeconds: r.durationSeconds,
        outcomeStatus: r.outcomeStatus,
        pipelineStatus: r.pipelineStatus,
        agentName: r.agent?.name ?? null,
        companyName: r.lead?.companyName ?? null,
        overallScore: a?.overallScore ?? null,
        summary: result?.summary ?? null,
        moments: result
          ? {
              strong: result.moments.filter((m) => m.kind === "strong").length,
              improve: result.moments.filter((m) => m.kind === "improve").length,
              missed: result.moments.filter((m) => m.kind === "missed").length,
            }
          : null,
      };
    }),
  };
}

export async function getCallDetail(id: string, where: Prisma.CallRecordingWhereInput) {
  const rec = await prisma.callRecording.findFirst({
    where: { ...where, id },
    select: {
      id: true,
      startedAt: true,
      durationSeconds: true,
      direction: true,
      channels: true,
      outcomeStatus: true,
      playbackUrl: true,
      agent: { select: { name: true } },
      lead: { select: { id: true, companyName: true } },
      transcript: { select: { segments: true, language: true, mode: true } },
      analyses: {
        where: { analysisVersion: { in: COMPATIBLE_ANALYSIS_VERSIONS } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { result: true, scores: true, overallScore: true, source: true, model: true, warnings: true, createdAt: true },
      },
    },
  });
  if (!rec) return null;
  const a = rec.analyses[0];
  return {
    ...rec,
    segments: (rec.transcript?.segments ?? []) as unknown as TranscriptSegment[],
    analysis: a
      ? {
          result: a.result as unknown as StoredCallAnalysis,
          scores: a.scores as unknown as CallScores,
          overallScore: a.overallScore,
          source: a.source,
          model: a.model,
          warnings: (a.warnings ?? []) as unknown as string[],
          createdAt: a.createdAt,
        }
      : null,
  };
}
