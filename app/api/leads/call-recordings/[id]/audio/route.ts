import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

const MAX_RECORDING_BYTES = 45 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

async function fetchRecordingBytes(url: string): Promise<{ body: Buffer; contentType: string }> {
  let res = await fetch(url, { redirect: "follow" });
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!res.ok && apiKey) {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: "follow",
    });
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > MAX_RECORDING_BYTES) {
      throw new Error("too_large");
    }
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_RECORDING_BYTES) {
    throw new Error("too_large");
  }
  const rawCt = res.headers.get("content-type");
  const contentType = rawCt?.split(";")[0]?.trim() || "audio/mpeg";
  return { body: Buffer.from(ab), contentType };
}

/**
 * GET /api/leads/call-recordings/[id]/audio
 * Same-origin stream til afspilleren, så dual-track kan mixes til begge højttalere.
 */
export async function GET(req: Request, { params }: Params) {
  const { response } = await requireSession();
  if (response) return response;

  const { id: eventId } = await params;

  const ev = await prisma.leadActivityEvent.findFirst({
    where: {
      id: eventId,
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      recordingUrl: { not: null },
    },
    select: { recordingUrl: true },
  });

  if (!ev?.recordingUrl) {
    return NextResponse.json({ error: "Ikke fundet." }, { status: 404 });
  }

  let bytes: Buffer;
  let contentType: string;
  try {
    const got = await fetchRecordingBytes(ev.recordingUrl);
    bytes = got.body;
    contentType = got.contentType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "too_large") {
      return NextResponse.json({ error: "Filen er for stor." }, { status: 413 });
    }
    console.warn("[call-recordings/audio] fetch failed", msg, eventId);
    return NextResponse.json({ error: "Kunne ikke hente optagelsen." }, { status: 502 });
  }

  const headers = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=3600",
  };
  // Safari afspiller kun lyd, når serveren svarer på Range-forespørgsler (206).
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
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
