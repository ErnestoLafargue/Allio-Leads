import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";

const MAX_RECORDING_BYTES = 45 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

function extFromContentType(ct: string): string {
  const lower = ct.toLowerCase();
  if (lower.includes("mpeg") || lower.includes("mp3")) return ".mp3";
  if (lower.includes("wav")) return ".wav";
  if (lower.includes("ogg")) return ".ogg";
  if (lower.includes("mp4") || lower.includes("m4a")) return ".m4a";
  return ".audio";
}

function safeAsciiFilename(base: string, ext: string): string {
  const cleaned = base.replace(/[/\\?%*:|"<>]/g, "-").trim() || "optagelse";
  const ascii = cleaned.replace(/[^\x20-\x7E]/g, "_").slice(0, 120);
  return `${ascii}${ext}`;
}

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
  const contentType = rawCt?.split(";")[0]?.trim() || "application/octet-stream";
  return { body: Buffer.from(ab), contentType };
}

/**
 * GET /api/leads/call-recordings/[id]/download
 * Streamer optagelsen som vedhæftning (samme adgang som lydfil-listen).
 */
export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { id: eventId } = await params;

  const ev = await prisma.leadActivityEvent.findFirst({
    where: {
      id: eventId,
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      recordingUrl: { not: null },
    },
    select: {
      id: true,
      createdAt: true,
      recordingUrl: true,
      lead: {
        select: {
          id: true,
          companyName: true,
          status: true,
          bookedByUserId: true,
          callbackReservedByUserId: true,
        },
      },
    },
  });

  if (!ev?.recordingUrl) {
    return NextResponse.json({ error: "Ikke fundet." }, { status: 404 });
  }

  if (!canAccessCallbackLead(session.user.role, session.user.id, ev.lead)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }
  if (!canAccessBookedMeetingNotes(session.user.role, session.user.id, ev.lead)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
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
    console.warn("[call-recordings/download] fetch failed", msg, eventId);
    return NextResponse.json({ error: "Kunne ikke hente optagelsen." }, { status: 502 });
  }

  const ext = extFromContentType(contentType);
  const datePart = ev.createdAt.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const baseName = `${ev.lead.companyName || "lead"}_${datePart}`;
  const filename = safeAsciiFilename(baseName, ext);

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const runtime = "nodejs";
