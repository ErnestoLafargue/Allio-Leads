/**
 * Live-coach, lag 2: Claude Haiku skriver ét coach-kort tilpasset samtalen. Svaret streames i et
 * fast tekstformat (SIGNAL / HVORFOR / REPLIK — se card.ts), så browseren kan vise replikken ord for ord.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { usageCostUsd } from "@/lib/anthropic-client";
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import type { CoachLine } from "./card";

export type { CoachLine } from "./card";

export const LIVE_COACH_MODEL = "claude-haiku-4-5-20251001";
/** Haiku 4.5 (USD pr. 1M tokens): input 1, output 5; cache-skriv 1,25, cache-læs 0,1. */
const HAIKU_PRICE_FACTOR = 1 / 5;

export function liveCoachSystemPrompt(scriptResponses: Partial<Record<ObjectionCategory, string>>): string {
  const answers = Object.entries(scriptResponses)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `Du er live-coach for en dansk mødebooker fra Allio, mens sælgeren taler i telefon med en klinik. Allio hjælper klinikker med at få mere ud af de leads og kunder, de allerede har (genbesøg, genaktivering, konvertering, anmeldelser); 2.500 kr./md. Målet med opkaldet er ét: et ja til et møde (45–75 min) med en specialist, der kigger på klinikkens egne tal.

Du ser de seneste replikker. Giv ÉT kort, der hjælper sælgeren med det næste, sælgeren skal sige — kort, konkret og til at sige højt.

Svar PRÆCIS i dette format og intet andet:
SIGNAL: <ét af: tryghed, klarhed, okonomi, skepsis, timing, lav_interesse, ingen>
HVORFOR: <3–6 ord om hvad kunden mangler>
REPLIK: <én sætning, højst 30 ord, som sælgeren kan sige nu>

Regler:
- Tag udgangspunkt i det kunden lige har sagt. Opfind aldrig tal, navne eller cases.
- Ved en indvending: brug jeres bedste svar nedenfor som grundlag, men tilpas det til kundens ord.
- Er der intet at hjælpe med, så skriv SIGNAL: ingen.

Jeres bedste svar på indvendinger (fra ugens script):
${answers || "- (ingen)"}`;
}

export function liveCoachUserMessage(lines: readonly CoachLine[], trigger: ObjectionCategory | null): string {
  const recent = lines.slice(-12).map((l) => `${l.speaker === "agent" ? "Sælger" : "Kunde"}: ${l.text}`);
  return [...recent, "", trigger ? `(Mulig indvending: ${trigger})` : "", "Giv kortet nu."].filter(Boolean).join("\n");
}

/** Streamer kortets tekst som bytes; prisen logges, når svaret er færdigt. */
export function streamSuggestion(params: {
  client: Anthropic;
  system: string;
  userMessage: string;
  onDone?: (info: { costUsd: number; ms: number }) => void;
}): ReadableStream<Uint8Array> {
  const started = Date.now();
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const stream = params.client.messages.stream({
          model: LIVE_COACH_MODEL,
          max_tokens: 200,
          system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: params.userMessage }],
        });
        stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        const message = await stream.finalMessage();
        params.onDone?.({ costUsd: usageCostUsd(message.usage) * HAIKU_PRICE_FACTOR, ms: Date.now() - started });
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
