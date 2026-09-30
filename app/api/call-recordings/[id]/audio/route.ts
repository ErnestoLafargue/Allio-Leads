import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchTelnyxRecordingMp3 } from "@/lib/call-transcription/audio";
import { callScope, getViewer } from "@/lib/scripts-traening/queries";

/**
 * GET /api/call-recordings/[id]/audio
 *
 * Lyd til «Scripts & Træning» for samtaler uden egen Blob-kopi: henter en frisk Telnyx-URL og
 * leverer filen fra samme origin (så afspilleren kan mixe til mono). Understøtter Range, så man
 * kan springe til et citat. Sælgere har kun adgang til egne samtaler.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  const { id } = await params;
  const rec = await prisma.callRecording.findFirst({
    where: { ...callScope(viewer), id },
    select: { telnyxRecordingId: true },
  });
  if (!rec) return NextResponse.json({ error: "Samtalen findes ikke" }, { status: 404 });
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "TELNYX_API_KEY mangler" }, { status: 500 });

  let bytes: Buffer;
  try {
    bytes = await fetchTelnyxRecordingMp3(apiKey, rec.telnyxRecordingId);
  } catch (err) {
    console.warn("[call-recordings/audio]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kunne ikke hente lyden fra Telnyx" }, { status: 502 });
  }

  const headers = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const size = bytes.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2] || 0));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new NextResponse(new Uint8Array(bytes.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Length": String(bytes.length) } });
}
