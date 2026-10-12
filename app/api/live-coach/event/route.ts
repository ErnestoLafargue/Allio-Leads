import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LIVE_COACH_PROMPT_VERSION } from "@/lib/live-coach/events";
import { getViewer } from "@/lib/scripts-traening/queries";

/**
 * POST /api/live-coach/event
 *  - { source: "trigger", category, signal, line, latencyMs }  → opretter et kort (svarer { id })
 *  - { id, latencyMs?, helpful? }                               → opdaterer sælgerens eget kort
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Ugyldig forespørgsel" }, { status: 400 });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
  const latencyMs = typeof b.latencyMs === "number" && Number.isFinite(b.latencyMs) ? Math.round(b.latencyMs) : undefined;
  const helpful = typeof b.helpful === "boolean" ? b.helpful : undefined;

  if (typeof b.id === "string") {
    const r = await prisma.liveCoachEvent.updateMany({
      where: { id: b.id, userId: viewer.userId },
      data: { ...(latencyMs !== undefined ? { latencyMs } : {}), ...(helpful !== undefined ? { helpful } : {}) },
    });
    return NextResponse.json({ ok: r.count === 1 });
  }
  const created = await prisma.liveCoachEvent.create({
    data: {
      userId: viewer.userId,
      source: "trigger",
      category: str(b.category, 40),
      signal: str(b.signal, 20),
      line: str(b.line, 500),
      latencyMs: latencyMs ?? null,
      promptVersion: LIVE_COACH_PROMPT_VERSION,
    },
    select: { id: true },
  });
  return NextResponse.json(created);
}
