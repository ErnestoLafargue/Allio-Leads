import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/call-analysis/schema";
import { parseCoachText } from "@/lib/live-coach/card";
import { LIVE_COACH_PROMPT_VERSION, liveCoachMonthlyBudgetUsd, liveCoachSpentThisMonth } from "@/lib/live-coach/events";
import { activeScriptResponses, objectionBank } from "@/lib/live-coach/script-responses";
import { liveCoachSystemPrompt, liveCoachUserMessage, streamSuggestion, type CoachLine } from "@/lib/live-coach/suggest";
import { getViewer } from "@/lib/scripts-traening/queries";

/**
 * POST /api/live-coach/suggest  { lines: [{speaker, text}], trigger?: kategori }
 *
 * Live-coachens lag 2: streamer ét kort (SIGNAL / HVORFOR / REPLIK) fra Claude Haiku som tekst.
 * Kortet logges som LiveCoachEvent (id i headeren X-Coach-Event) med pris; månedsloft → 429.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { lines?: CoachLine[]; trigger?: string | null } | null;
  const lines = (body?.lines ?? [])
    .filter((l) => (l.speaker === "agent" || l.speaker === "customer") && typeof l.text === "string")
    .map((l) => ({ speaker: l.speaker, text: l.text.slice(0, 600) }))
    .slice(-12);
  if (!lines.length) return NextResponse.json({ error: "Ingen replikker" }, { status: 400 });
  if ((await liveCoachSpentThisMonth()) >= liveCoachMonthlyBudgetUsd()) {
    return NextResponse.json({ error: "Live-coachens månedsloft er nået" }, { status: 429 });
  }
  const trigger = (OBJECTION_CATEGORIES as readonly string[]).includes(body?.trigger ?? "")
    ? (body!.trigger as ObjectionCategory)
    : null;

  const event = await prisma.liveCoachEvent.create({
    data: { userId: viewer.userId, source: "ai", category: trigger, promptVersion: LIVE_COACH_PROMPT_VERSION },
    select: { id: true },
  });
  const stream = streamSuggestion({
    client: createAnthropicClient(),
    system: liveCoachSystemPrompt(await activeScriptResponses(), await objectionBank()),
    userMessage: liveCoachUserMessage(lines, trigger),
    onDone: ({ costUsd, text }) => {
      const card = parseCoachText(text);
      void prisma.liveCoachEvent
        .update({ where: { id: event.id }, data: { costUsd, signal: card.silent ? "ingen" : card.signal, line: card.line || null } })
        .catch((err: unknown) => console.warn("[live-coach] kunne ikke logge kortet", err));
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Coach-Event": event.id },
  });
}
