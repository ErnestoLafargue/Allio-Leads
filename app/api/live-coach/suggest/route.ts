import { NextResponse } from "next/server";
import { createAnthropicClient } from "@/lib/anthropic-client";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/call-analysis/schema";
import { activeScriptResponses } from "@/lib/live-coach/script-responses";
import { liveCoachSystemPrompt, liveCoachUserMessage, streamSuggestion, type CoachLine } from "@/lib/live-coach/suggest";
import { getViewer } from "@/lib/scripts-traening/queries";

/**
 * POST /api/live-coach/suggest  { lines: [{speaker, text}], trigger?: kategori }
 *
 * Live-coachens lag 2: streamer ét kort (SIGNAL / HVORFOR / REPLIK) fra Claude Haiku som tekst.
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
  const trigger = (OBJECTION_CATEGORIES as readonly string[]).includes(body?.trigger ?? "")
    ? (body!.trigger as ObjectionCategory)
    : null;

  const stream = streamSuggestion({
    client: createAnthropicClient(),
    system: liveCoachSystemPrompt(await activeScriptResponses()),
    userMessage: liveCoachUserMessage(lines, trigger),
    onDone: ({ costUsd, ms }) => console.log(`[live-coach] kort til ${viewer.name}: ${ms} ms, $${costUsd.toFixed(5)}`),
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
