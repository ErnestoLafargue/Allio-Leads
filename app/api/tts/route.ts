import type { NextRequest } from "next/server";
import { forSpeech } from "@/lib/ai-saelger/agents";
import { resolveVoice } from "@/lib/ai-saelger/custom-voices";
import { getViewer } from "@/lib/scripts-traening/queries";

/** Kundens stemme på øvesiderne: dansk ElevenLabs-stemme (Camilla) på den billige, hurtige Flash-model. */
const CUSTOMER_VOICE = { voiceId: "4RklGmuxoAskAbGXplXN", model: "eleven_flash_v2_5" };

/**
 * GET /api/tts?voice=<christian-v3c|isabella-v3c|isabella-v4t|ernesto-v3c|kunde>&text=…
 * Streamer ElevenLabs-lyd (mp3) direkte videre, så <audio> kan begynde at spille, før hele sætningen er
 * genereret. Agentstemmerne er præcis dem, AI-mødebookeren bruger i telefonen (samme stemme og model).
 */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Ikke logget ind", { status: 401 });
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return new Response("ELEVENLABS_API_KEY mangler", { status: 500 });
  const voiceKey = req.nextUrl.searchParams.get("voice") ?? "kunde";
  const raw = (req.nextUrl.searchParams.get("text") ?? "").slice(0, 1200).trim();
  // Teksten lige før (samme replik), så tonen hænger sammen mellem sætninger. v3 understøtter det ikke.
  const prev = (req.nextUrl.searchParams.get("prev") ?? "").slice(-400).trim();
  if (!raw) return new Response("Mangler tekst", { status: 400 });

  const agent = await resolveVoice(voiceKey);
  const voice = agent ? { voiceId: agent.voiceId, model: agent.model } : CUSTOMER_VOICE;
  const text = agent ? forSpeech(raw, agent) : raw.replace(/\s*\[[^\]]*\]\s*/g, " ").trim();

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: voice.model,
      language_code: "da",
      ...(prev && !voice.model.startsWith("eleven_v3") ? { previous_text: agent ? forSpeech(prev, agent) : prev } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.warn("[tts]", res.status, detail);
    // Årsagen vises på siden (fx ubetalt faktura eller manglende rettigheder på nøglen).
    return new Response(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`, { status: 502 });
  }
  return new Response(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
}
