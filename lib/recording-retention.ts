/**
 * Standard-retention for gemte lydfiler: 12 måneder.
 * Efter cutoff slettes Blob-kopien, og afspilnings-URL'en nulstilles.
 */
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { isVercelBlobUrl } from "@/lib/telnyx-recordings-backfill";

export const RECORDING_RETENTION_MONTHS = 12;
export const RECORDING_PURGE_BATCH = 40;

export function recordingRetentionCutoff(now = new Date()): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RECORDING_RETENTION_MONTHS);
  return cutoff;
}

function collectBlobUrl(url: string | null | undefined, into: Set<string>) {
  const v = url?.trim();
  if (v && isVercelBlobUrl(v)) into.add(v);
}

export async function purgeExpiredRecordings(params?: {
  limit?: number;
  now?: Date;
}): Promise<{
  cutoffIso: string;
  blobsDeleted: number;
  eventsCleared: number;
  callRecordingsCleared: number;
  callLogsCleared: number;
  errors: number;
}> {
  const cutoff = recordingRetentionCutoff(params?.now);
  const limit = Math.min(100, Math.max(1, params?.limit ?? RECORDING_PURGE_BATCH));
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  const [events, callRecordings, callLogs] = await Promise.all([
    prisma.leadActivityEvent.findMany({
      where: {
        kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
        createdAt: { lt: cutoff },
        recordingUrl: { not: null },
        NOT: { recordingUrl: "" },
      },
      select: { id: true, recordingUrl: true },
      take: limit,
      orderBy: { createdAt: "asc" },
    }),
    prisma.callRecording.findMany({
      where: {
        startedAt: { lt: cutoff },
        playbackUrl: { not: null },
        NOT: { playbackUrl: "" },
      },
      select: { id: true, playbackUrl: true },
      take: limit,
      orderBy: { startedAt: "asc" },
    }),
    prisma.dialerCallLog.findMany({
      where: {
        startedAt: { lt: cutoff },
        recordingUrl: { not: null },
        NOT: { recordingUrl: "" },
      },
      select: { callControlId: true, recordingUrl: true },
      take: limit,
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const blobUrls = new Set<string>();
  for (const row of events) collectBlobUrl(row.recordingUrl, blobUrls);
  for (const row of callRecordings) collectBlobUrl(row.playbackUrl, blobUrls);
  for (const row of callLogs) collectBlobUrl(row.recordingUrl, blobUrls);

  let blobsDeleted = 0;
  let errors = 0;
  if (token && blobUrls.size > 0) {
    const urls = [...blobUrls];
    try {
      await del(urls, { token });
      blobsDeleted = urls.length;
    } catch (err) {
      errors += 1;
      console.error(
        "[recording-retention] blob del failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (errors === 0) {
    if (events.length > 0) {
      await prisma.leadActivityEvent.updateMany({
        where: { id: { in: events.map((e) => e.id) } },
        data: { recordingUrl: null },
      });
    }
    if (callRecordings.length > 0) {
      await prisma.callRecording.updateMany({
        where: { id: { in: callRecordings.map((r) => r.id) } },
        data: { playbackUrl: null },
      });
    }
    if (callLogs.length > 0) {
      await prisma.dialerCallLog.updateMany({
        where: { callControlId: { in: callLogs.map((r) => r.callControlId) } },
        data: { recordingUrl: null },
      });
    }
  }

  return {
    cutoffIso: cutoff.toISOString(),
    blobsDeleted,
    eventsCleared: errors === 0 ? events.length : 0,
    callRecordingsCleared: errors === 0 ? callRecordings.length : 0,
    callLogsCleared: errors === 0 ? callLogs.length : 0,
    errors,
  };
}
