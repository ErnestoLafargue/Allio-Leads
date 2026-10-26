/**
 * Genhent frisk Telnyx-download-URL og kopiér til Vercel Blob når en gemt
 * CALL_RECORDING-URL er udløbet (typisk S3 signed URL med Expires=600).
 */
import { prisma } from "@/lib/prisma";
import { persistTelnyxRecordingToAllio } from "@/lib/telnyx-recording-storage";
import {
  isVercelBlobUrl,
  listTelnyxRecordings,
} from "@/lib/telnyx-recordings-backfill";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

export async function resolveFreshTelnyxMp3Url(params: {
  apiKey: string;
  telnyxCallLegId: string | null;
}): Promise<{ recordingId: string; mp3Url: string; callControlId: string } | null> {
  const leg = params.telnyxCallLegId?.trim() || null;
  if (!leg) return null;
  const apiKey = params.apiKey;

  if (leg.startsWith("rec:")) {
    const recordingId = leg.slice(4);
    const res = await fetch(`${TELNYX_API_BASE}/recordings/${encodeURIComponent(recordingId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        id?: string;
        call_control_id?: string | null;
        download_urls?: { mp3?: string };
        recording_urls?: { mp3?: string };
      };
    };
    const d = json.data;
    const mp3 = d?.download_urls?.mp3 ?? d?.recording_urls?.mp3;
    if (!d?.id || !mp3) return null;
    return {
      recordingId: d.id,
      mp3Url: mp3,
      callControlId: d.call_control_id || leg,
    };
  }

  const byControl = await listTelnyxRecordings({
    apiKey,
    pageSize: 20,
    filterCallControlId: leg,
  });
  if (byControl.ok) {
    const hit = byControl.recordings.find((r) => r.mp3Url);
    if (hit?.mp3Url) {
      return {
        recordingId: hit.id,
        mp3Url: hit.mp3Url,
        callControlId: hit.callControlId || leg,
      };
    }
  }

  const dialer = await prisma.dialerCallLog.findFirst({
    where: { callControlId: leg },
    select: { callSessionId: true },
  });
  if (dialer?.callSessionId) {
    const bySession = await listTelnyxRecordings({
      apiKey,
      pageSize: 20,
      filterCallSessionId: dialer.callSessionId,
    });
    if (bySession.ok) {
      const hit = bySession.recordings.find((r) => r.mp3Url);
      if (hit?.mp3Url) {
        return {
          recordingId: hit.id,
          mp3Url: hit.mp3Url,
          callControlId: hit.callControlId || leg,
        };
      }
    }
  }

  return null;
}

/**
 * Henter frisk mp3, lægger den i Blob, opdaterer LeadActivityEvent (+ DialerCallLog)
 * og returnerer bytes til streaming. null hvis recovery ikke lykkes.
 */
export async function recoverLeadActivityRecording(params: {
  eventId: string;
  leadId: string;
  telnyxCallLegId: string | null;
}): Promise<{ body: Buffer; contentType: string; playbackUrl: string } | null> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) return null;

  const fresh = await resolveFreshTelnyxMp3Url({
    apiKey,
    telnyxCallLegId: params.telnyxCallLegId,
  });
  if (!fresh) return null;

  const persisted = await persistTelnyxRecordingToAllio({
    telnyxMp3Url: fresh.mp3Url,
    leadId: params.leadId,
    callControlId: fresh.callControlId,
  });

  // Persist downloader allerede bytes — hent dem igen fra playbackUrl (blob eller frisk S3).
  const res = await fetch(persisted.playbackUrl, { redirect: "follow" });
  if (!res.ok) return null;
  const body = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";

  if (persisted.storedOnAllio && isVercelBlobUrl(persisted.playbackUrl)) {
    await prisma.leadActivityEvent.update({
      where: { id: params.eventId },
      data: { recordingUrl: persisted.playbackUrl },
    });
    if (params.telnyxCallLegId && !params.telnyxCallLegId.startsWith("rec:")) {
      await prisma.dialerCallLog.updateMany({
        where: { callControlId: params.telnyxCallLegId },
        data: { recordingUrl: persisted.playbackUrl },
      });
    }
  }

  return { body, contentType, playbackUrl: persisted.playbackUrl };
}

async function blobUrlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * URL browseren kan åbne direkte. En levende Blob-kopi bruges som den er.
 * Ellers hentes filen fra Telnyx igen og lægges i Blob.
 */
export async function resolvePlayableRecordingUrl(params: {
  eventId: string;
  leadId: string;
  telnyxCallLegId: string | null;
  recordingUrl: string;
}): Promise<string | null> {
  const current = params.recordingUrl.trim();
  if (isVercelBlobUrl(current) && (await blobUrlReachable(current))) return current;
  const recovered = await recoverLeadActivityRecording(params);
  const next = recovered?.playbackUrl?.trim() ?? "";
  return next || null;
}
