import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { TimeClockError } from "@/lib/time-clock";
import { adminDeleteTimeClockEntry, adminUpdateTimeClockEntry } from "@/lib/time-clock-store";

type Params = { params: Promise<{ id: string }> };

function parseIso(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * PATCH /api/time-clock/entries/:id
 * Admin: ret ind/ud for en eksisterende stempling.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  if (!id.trim()) {
    return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    punchedInAt?: unknown;
    punchedOutAt?: unknown;
  } | null;
  const punchedInAt = parseIso(body?.punchedInAt);
  const punchedOutAt =
    body?.punchedOutAt == null || body.punchedOutAt === "" ? null : parseIso(body.punchedOutAt);

  if (!punchedInAt) {
    return NextResponse.json({ error: "Angiv ind-tidspunkt." }, { status: 400 });
  }
  if (body?.punchedOutAt != null && body.punchedOutAt !== "" && !punchedOutAt) {
    return NextResponse.json({ error: "Ugyldigt ud-tidspunkt." }, { status: 400 });
  }

  try {
    await adminUpdateTimeClockEntry({ entryId: id, punchedInAt, punchedOutAt });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TimeClockError) {
      const status = e.code === "not_found" ? 404 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[time-clock entries PATCH]", e);
    return NextResponse.json({ error: "Kunne ikke rette stempling", details: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/time-clock/entries/:id
 * Admin: slet en forkert stempling.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  if (!id.trim()) {
    return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  }

  try {
    await adminDeleteTimeClockEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TimeClockError) {
      const status = e.code === "not_found" ? 404 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[time-clock entries DELETE]", e);
    return NextResponse.json({ error: "Kunne ikke slette stempling", details: msg }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 15;
