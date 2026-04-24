/**
 * Henter lydfil fra Telnyx (webhook-URL) og lægger en kopi i Vercel Blob så afspilning
 * ikke afhænger af udløbende Telnyx-/S3-URL'er.
 *
 * Kræver `BLOB_READ_WRITE_TOKEN` (Vercel Blob) — ellers beholdes den originale Telnyx-URL.
 */

const MAX_RECORDING_BYTES = 45 * 1024 * 1024;

export async function downloadTelnyxRecording(
  sourceUrl: string,
  apiKey: string | undefined,
): Promise<Buffer | null> {
  const fetchOnce = async (headers?: HeadersInit) => {
    const res = await fetch(sourceUrl, { headers, redirect: "follow" });
    return res;
  };

  let res = await fetchOnce();
  if (!res.ok && apiKey) {
    res = await fetchOnce({ Authorization: `Bearer ${apiKey}` });
  }
  if (!res.ok) {
    console.warn("[telnyx-recording-storage] download failed", res.status, sourceUrl.slice(0, 80));
    return null;
  }

  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > MAX_RECORDING_BYTES) {
      console.warn("[telnyx-recording-storage] recording too large (header), skip copy");
      return null;
    }
  }

  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_RECORDING_BYTES) {
    console.warn("[telnyx-recording-storage] recording too large (body), skip copy");
    return null;
  }
  return Buffer.from(ab);
}

export async function storeRecordingInVercelBlob(params: {
  leadId: string;
  callControlId: string;
  bytes: Buffer;
}): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;

  try {
    const { put } = await import("@vercel/blob");
    const safeLeg = params.callControlId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-24) || "leg";
    const name = `call-recordings/lead-${params.leadId}-${safeLeg}-${Date.now()}.mp3`;
    const blob = await put(name, params.bytes, {
      access: "public",
      contentType: "audio/mpeg",
      token,
    });
    return blob.url;
  } catch (e) {
    console.error("[telnyx-recording-storage] Blob put failed:", e);
    return null;
  }
}

export type PersistRecordingResult = {
  /** URL der bør gemmes i DB (Blob hvis kopiering lykkedes, ellers Telnyx) */
  playbackUrl: string;
  /** true hvis filen nu ligger på Vercel Blob */
  storedOnAllio: boolean;
};

/**
 * Forsøg at kopiere optagelsen til Vercel Blob. Ved fejl returneres original Telnyx-URL.
 */
export async function persistTelnyxRecordingToAllio(params: {
  telnyxMp3Url: string;
  leadId: string;
  callControlId: string;
}): Promise<PersistRecordingResult> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  const bytes = await downloadTelnyxRecording(params.telnyxMp3Url, apiKey);
  if (!bytes) {
    return { playbackUrl: params.telnyxMp3Url, storedOnAllio: false };
  }

  const blobUrl = await storeRecordingInVercelBlob({
    leadId: params.leadId,
    callControlId: params.callControlId,
    bytes,
  });

  if (blobUrl) {
    return { playbackUrl: blobUrl, storedOnAllio: true };
  }
  return { playbackUrl: params.telnyxMp3Url, storedOnAllio: false };
}
