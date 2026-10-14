/**
 * Lyttetest for AI-sælgerens stemme: de samme danske replikker (med «øh», suk, latter og tænkelyde)
 * genereres hos ElevenLabs, Cartesia og OpenAI. Måler tid til første lydbyte (TTFB) og samlet tid,
 * og gemmer mp3-filer + resultater.json i ud-mappen.
 *
 *   npx tsx scripts/ai-saelger-lyttetest.ts <ud-mappe>
 *
 * Kræver ELEVENLABS_API_KEY, CARTESIA_API_KEY og OPENAI_API_KEY. Koster få kroner (ca. 15.000 tegn).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Gender = "m" | "f";
type Provider = "elevenlabs" | "cartesia" | "openai";
type Candidate = { provider: Provider; model: string; voiceId: string; voice: string; gender: Gender; tags: boolean };

/** Replikkerne. {navn} = Adrian/Cathrine. [laughs]/[sighs] er lyd-tags (fjernes for modeller uden tags). */
const LINES: { key: string; text: string }[] = [
  { key: "aabning", text: "Hej Lars, det er {navn}. Øh, har du lige to minutter?" },
  {
    key: "aerlig",
    text: "Jeg skal være ærlig med dig: jeg er mødebooker, og jeg ringer, fordi I bruger GeckoBook. Men det her er ikke et salgsopkald [laughs] – jeg skal ikke sælge dig noget i telefonen.",
  },
  {
    key: "pris",
    text: "[sighs] Altså… mm, jeg forstår godt. Men to tusind fem hundrede kroner om måneden, det er jo ingenting i forhold til de seks-tolv tusind, I ellers bruger på markedsføring.",
  },
  { key: "taenker", text: "Øhm… bum bum bum, lad mig lige se… Torsdag klokken ti eller fredag klokken ni – hvad passer dig bedst?" },
  { key: "sekretaer", text: "Goddag Cecilie. Jeg skulle gerne have fat i Lars Hammer – er han til stede nu, eller skal jeg prøve igen lidt senere?" },
];

const EL_V3_VOICES: [string, string, Gender][] = [
  ["6SjhOkgKPuHxm8q0eIyp", "Christian (ung)", "m"],
  ["V34B5u5UbLdNJVEkcgXp", "Noam (ung)", "m"],
  ["hbLdgbgzfKYPCUr4Rs2V", "Jonas (ung)", "m"],
  ["ygiXC2Oa1BiHksD3WkJZ", "Mathias", "m"],
  ["BIWC0507fYMfhPcAEIRP", "Mads", "m"],
  ["gIfqD5jrnhkFu8ENVbXC", "Isabella (ung)", "f"],
  ["6YKajEZO7fjiakslxwff", "Amalie (ung)", "f"],
  ["4RklGmuxoAskAbGXplXN", "Camilla", "f"],
];

const CANDIDATES: Candidate[] = [
  ...EL_V3_VOICES.map(([voiceId, voice, gender]) => ({ provider: "elevenlabs" as const, model: "eleven_v3", voiceId, voice, gender, tags: true })),
  ...(["eleven_v3_conversational", "eleven_v4_turbo", "eleven_flash_v2_5"] as const).flatMap((model) =>
    [EL_V3_VOICES[0]!, EL_V3_VOICES[5]!].map(([voiceId, voice, gender]) => ({
      provider: "elevenlabs" as const,
      model,
      voiceId,
      voice,
      gender,
      tags: model === "eleven_v3_conversational",
    })),
  ),
  { provider: "cartesia", model: "sonic-3", voiceId: "a466f9e2-28eb-4bb7-925c-8e8984950700", voice: "Søren", gender: "m", tags: true },
  { provider: "cartesia", model: "sonic-3", voiceId: "926e0766-f380-4d77-aeb0-9aa4ebb16b38", voice: "Soren (executive)", gender: "m", tags: true },
  { provider: "cartesia", model: "sonic-3", voiceId: "eb929394-68e7-4e08-bd2f-e7055728a5e1", voice: "Mette", gender: "f", tags: true },
  { provider: "cartesia", model: "sonic-3", voiceId: "c323c793-41f9-47b8-99dc-9b44b0440b84", voice: "Katrine", gender: "f", tags: true },
  { provider: "openai", model: "gpt-4o-mini-tts", voiceId: "ash", voice: "Ash", gender: "m", tags: false },
  { provider: "openai", model: "gpt-4o-mini-tts", voiceId: "coral", voice: "Coral", gender: "f", tags: false },
];

export function lineText(text: string, gender: Gender, provider: Provider, tags: boolean): string {
  const named = text.replaceAll("{navn}", gender === "m" ? "Adrian" : "Cathrine");
  if (!tags) return named.replace(/\s*\[(laughs|sighs)\]\s*/g, " ").replace(/\s+/g, " ").trim();
  // Cartesia Sonic-3 kender [laughter]; suk har den ikke et tag for.
  if (provider === "cartesia") return named.replaceAll("[laughs]", "[laughter]").replace(/\s*\[sighs\]\s*/g, " ").trim();
  return named;
}

function request(c: Candidate, text: string): Request {
  if (c.provider === "elevenlabs") {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${c.voiceId}/stream?output_format=mp3_44100_64`;
    return new Request(url, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: c.model, language_code: "da" }),
    });
  }
  if (c.provider === "cartesia") {
    return new Request("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: { "X-API-Key": process.env.CARTESIA_API_KEY ?? "", "Cartesia-Version": "2025-04-16", "content-type": "application/json" },
      body: JSON.stringify({
        model_id: c.model,
        transcript: text,
        voice: { mode: "id", id: c.voiceId },
        language: "da",
        output_format: { container: "mp3", sample_rate: 44100, bit_rate: 64000 },
      }),
    });
  }
  return new Request("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: c.model,
      voice: c.voiceId,
      input: text,
      response_format: "mp3",
      instructions:
        "Tal naturligt, afslappet københavnsk dansk som en 26-årig mødebooker i telefonen. Sig «øh» og «mm» naturligt, hold små tænkepauser, smil i stemmen og grin lidt, hvor det passer.",
    }),
  });
}

async function synth(c: Candidate, text: string): Promise<{ ttfbMs: number; totalMs: number; bytes: Buffer }> {
  const started = performance.now();
  const res = await fetch(request(c, text));
  if (!res.ok || !res.body) throw new Error(`${c.provider} ${c.model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let ttfbMs = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (ttfbMs < 0) ttfbMs = performance.now() - started;
    chunks.push(value);
  }
  return { ttfbMs: Math.round(ttfbMs), totalMs: Math.round(performance.now() - started), bytes: Buffer.concat(chunks) };
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Brug: npx tsx scripts/ai-saelger-lyttetest.ts <ud-mappe>");
  mkdirSync(out, { recursive: true });
  const results: Record<string, unknown>[] = [];
  for (const [ci, c] of CANDIDATES.entries()) {
    for (const line of LINES) {
      const text = lineText(line.text, c.gender, c.provider, c.tags);
      const file = `${ci.toString().padStart(2, "0")}-${c.provider}-${c.model}-${c.voiceId.slice(0, 8)}-${line.key}.mp3`;
      try {
        const r = await synth(c, text);
        writeFileSync(join(out, file), r.bytes);
        results.push({ ...c, line: line.key, text, file, ttfbMs: r.ttfbMs, totalMs: r.totalMs });
        console.log(`${c.provider}/${c.model}/${c.voice} ${line.key}: første lyd ${r.ttfbMs} ms, i alt ${r.totalMs} ms`);
      } catch (err) {
        results.push({ ...c, line: line.key, text, error: String(err) });
        console.error(String(err));
      }
    }
  }
  writeFileSync(join(out, "resultater.json"), JSON.stringify(results, null, 2));
}

if (process.argv[1]?.endsWith("ai-saelger-lyttetest.ts")) void main();
