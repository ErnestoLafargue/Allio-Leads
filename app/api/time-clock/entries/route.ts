import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { TimeClockError } from "@/lib/time-clock";
import { adminCreateTimeClockEntry } from "@/lib/time-clock-store";

function parseIso(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * POST /api/time-clock/entries
 * Admin: opret stempling for en sælger (glemt ind/ud).
 */
export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as {
    userId?: unknown;
    punchedInAt?: unknown;
    punchedOutAt?: unknown;
  } | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const punchedInAt = parseIso(body?.punchedInAt);
  const punchedOutAt =
    body?.punchedOutAt == null || body.punchedOutAt === "" ? null : parseIso(body.punchedOutAt);

  if (!userId || !punchedInAt) {
    return NextResponse.json({ error: "Angiv bruger og ind-tidspunkt." }, { status: 400 });
  }
  if (body?.punchedOutAt != null && body.punchedOutAt !== "" && !punchedOutAt) {
    return NextResponse.json({ error: "Ugyldigt ud-tidspunkt." }, { status: 400 });
  }

  try {
    await adminCreateTimeClockEntry({ userId, punchedInAt, punchedOutAt });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TimeClockError) {
      const status = e.code === "not_found" ? 404 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[time-clock entries POST]", e);
    return NextResponse.json({ error: "Kunne ikke oprette stempling", details: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 15;
