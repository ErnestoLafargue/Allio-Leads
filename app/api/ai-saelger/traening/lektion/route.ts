import { NextResponse } from "next/server";
import { isLessonSituation, situationLabel } from "@/lib/ai-saelger/training";
import { loadLessons } from "@/lib/ai-saelger/training-db";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/scripts-traening/queries";

/** GET /api/ai-saelger/traening/lektion — alle lektioner (nyeste først). */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const lessons = await loadLessons();
  return NextResponse.json(lessons.map((l) => ({ ...l, label: situationLabel(l.situation) })));
}

/**
 * POST /api/ai-saelger/traening/lektion { situation, customerLine, answer, avoidAnswer? } — gem et svar,
 * Adrian lærer af. Fra «Tal med Adrian»: situation «fra_samtale», avoidAnswer = hans dårlige svar (👎).
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { situation?: string; customerLine?: string; answer?: string; avoidAnswer?: string } | null;
  const answer = b?.answer?.trim().slice(0, 2000);
  const customerLine = b?.customerLine?.trim().slice(0, 600);
  if (!b?.situation || !isLessonSituation(b.situation) || !answer || !customerLine) return NextResponse.json({ error: "Mangler situation, replik eller svar" }, { status: 400 });
  const lesson = await prisma.aiSaelgerLesson.create({ data: { situation: b.situation, customerLine, answer, avoidAnswer: b.avoidAnswer?.trim().slice(0, 2000) || null, createdById: viewer.userId } });
  return NextResponse.json(lesson);
}

/** DELETE /api/ai-saelger/traening/lektion?id=… */
export async function DELETE(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  await prisma.aiSaelgerLesson.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
