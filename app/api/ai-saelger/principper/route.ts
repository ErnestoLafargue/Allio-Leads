import { NextResponse } from "next/server";
import { proposePrinciples } from "@/lib/ai-saelger/principles";
import { loadLessons } from "@/lib/ai-saelger/training-db";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/scripts-traening/queries";

export const maxDuration = 120;

/** GET — alle versioner af Adrians principper + hvor meget feedback der er kommet siden den aktive. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const versions = await prisma.aiSaelgerPrinciples.findMany({ orderBy: { version: "desc" }, take: 20 });
  const active = versions.find((v) => v.status === "active");
  const newFeedback = await prisma.aiSaelgerLesson.count({ where: active ? { createdAt: { gt: active.createdAt } } : {} });
  return NextResponse.json({ versions, newFeedback });
}

/**
 * POST { action: "foreslaa" } — Sonnet foreslår en ny version ud fra al feedback (kladde).
 * POST { action: "godkend" | "afvis", id } — Ernesto beslutter; godkendt bliver aktiv, den gamle trækkes tilbage.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { action?: string; id?: string } | null;

  if (b?.action === "foreslaa") {
    const [lessons, current, last] = await Promise.all([
      loadLessons(200),
      prisma.aiSaelgerPrinciples.findFirst({ where: { status: "active" }, orderBy: { version: "desc" } }),
      prisma.aiSaelgerPrinciples.findFirst({ orderBy: { version: "desc" }, select: { version: true } }),
    ]);
    if (!lessons.length) return NextResponse.json({ error: "Der er ingen feedback endnu" }, { status: 400 });
    try {
      const p = await proposePrinciples({ client: createAnthropicClient(), lessons, current: current?.text ?? null });
      const draft = await prisma.aiSaelgerPrinciples.create({
        data: { version: (last?.version ?? 0) + 1, text: p.text, rationale: p.rationale, lessonCount: lessons.length, costUsd: p.costUsd, createdById: viewer.userId },
      });
      return NextResponse.json(draft);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Kunne ikke lave forslaget" }, { status: 502 });
    }
  }

  if ((b?.action === "godkend" || b?.action === "afvis") && b.id) {
    if (b.action === "afvis") {
      await prisma.aiSaelgerPrinciples.update({ where: { id: b.id }, data: { status: "rejected", decidedAt: new Date() } });
    } else {
      await prisma.$transaction([
        prisma.aiSaelgerPrinciples.updateMany({ where: { status: "active" }, data: { status: "retired" } }),
        prisma.aiSaelgerPrinciples.update({ where: { id: b.id }, data: { status: "active", decidedAt: new Date() } }),
      ]);
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Ukendt handling" }, { status: 400 });
}
