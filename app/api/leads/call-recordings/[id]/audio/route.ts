import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { isVercelBlobUrl } from "@/lib/telnyx-recordings-backfill";
import { resolvePlayableRecordingUrl } from "@/lib/telnyx-recording-recover";

type Params = { params: Promise<{ id: string }> };

/** Videresend Range, så browseren kan starte før hele filen er hentet. */
async function streamRecording(url: string, range: string | null): Promise<Response> {
  const headers = new Headers();
  if (range) headers.set("Range", range);
  let res = await fetch(url, { headers, redirect: "follow" });
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!res.ok && res.status !== 206 && apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
    res = await fetch(url, { headers, redirect: "follow" });
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error("empty_body");
  }
  const out = new Headers();
  const rawCt = res.headers.get("content-type");
  out.set("Content-Type", rawCt?.split(";")[0]?.trim() || "audio/mpeg");
  out.set("Accept-Ranges", res.headers.get("accept-ranges") || "bytes");
  out.set("Cache-Control", "private, no-store");
  const len = res.headers.get("content-length");
  if (len) out.set("Content-Length", len);
  const contentRange = res.headers.get("content-range");
  if (contentRange) out.set("Content-Range", contentRange);
  return new NextResponse(res.body, { status: res.status, headers: out });
}

/**
 * GET /api/leads/call-recordings/[id]/audio
 * Blob-kopier redirectes, så browseren selv henter bidder (HTTP 206) direkte
 * fra lageret og kan starte før filen er færdig. `?resolve=1` returnerer kun
 * URL'en. Telnyx-links streames med samme Range-header og kopieres til Blob,
 * hvis linket er udløbet.
 */
export async function GET(req: Request, { params }: Params) {
  const { response } = await requireSession();
  if (response) return response;

  const { id: eventId } = await params;
  const resolveOnly = new URL(req.url).searchParams.get("resolve") === "1";

  const ev = await prisma.leadActivityEvent.findFirst({
    where: {
      id: eventId,
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      recordingUrl: { not: null },
    },
    select: { recordingUrl: true, leadId: true, telnyxCallLegId: true },
  });

  if (!ev?.recordingUrl) {
    return NextResponse.json({ error: "Ikke fundet." }, { status: 404 });
  }

  let playable: string | null = null;
  try {
    playable = await resolvePlayableRecordingUrl({
      eventId,
      leadId: ev.leadId,
      telnyxCallLegId: ev.telnyxCallLegId,
      recordingUrl: ev.recordingUrl,
    });
  } catch (recoverErr) {
    console.warn(
      "[call-recordings/audio] recover failed",
      recoverErr instanceof Error ? recoverErr.message : recoverErr,
      eventId,
    );
  }

  if (!playable) {
    return NextResponse.json({ error: "Kunne ikke hente optagelsen." }, { status: 502 });
  }

  if (resolveOnly) {
    return NextResponse.json({ url: playable });
  }

  if (isVercelBlobUrl(playable)) {
    return NextResponse.redirect(playable, 302);
  }

  try {
    return await streamRecording(playable, req.headers.get("range"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[call-recordings/audio] fetch failed", msg, eventId);
    return NextResponse.json({ error: "Kunne ikke hente optagelsen." }, { status: 502 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
