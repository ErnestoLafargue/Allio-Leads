/**
 * Fase 0 for live-coachen: måler latens med rigtig lyd uden browser. Klipper lyden omkring en
 * kendt kunde-indvending ud af en optagelse, streamer den i realtid til Soniox realtime (som
 * browseren gør) og måler tiden fra kundens ord til straks-kortet (lag 1) og til AI-kortets replik (lag 2).
 *
 * Brug:  set -a; . ./.env.local; . ./.env.branch; set +a
 *        npx tsx --tsconfig tsconfig.json scripts/live-coach-latency.ts [--calls 5]
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { createAnthropicClient } from "@/lib/anthropic-client";
import type { StoredCallAnalysis } from "@/lib/call-analysis/schema";
import { fetchTelnyxRecordingMp3, withTempDir } from "@/lib/call-transcription/audio";
import { parseCoachText } from "@/lib/live-coach/card";
import { activeScriptResponses, objectionBank } from "@/lib/live-coach/script-responses";
import { SONIOX_RT_URL, SpeakerTranscript, type SonioxToken } from "@/lib/live-coach/soniox-stream";
import { liveCoachSystemPrompt, liveCoachUserMessage, streamSuggestion } from "@/lib/live-coach/suggest";
import { detectObjection } from "@/lib/live-coach/triggers";

const run = promisify(execFile);
const RATE = 16000;
const LEAD_IN_S = 6;
const TAIL_S = 4;

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

type Sample = { id: string; category: string; quote: string; t: number; telnyxId: string };

async function pickSamples(n: number): Promise<Sample[]> {
  const rows = await prisma.callAnalysis.findMany({
    where: { callRecording: { channels: "single" } },
    select: { result: true, callRecording: { select: { id: true, telnyxRecordingId: true } } },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const out: Sample[] = [];
  for (const r of rows) {
    const a = r.result as unknown as StoredCallAnalysis;
    for (const o of a.objections ?? []) {
      const t = (o.customer as { t?: number }).t;
      if (t === undefined || t < LEAD_IN_S || seen.has(o.category) || !detectObjection(o.customer.quote)) continue;
      seen.add(o.category);
      out.push({ id: r.callRecording.id, category: o.category, quote: o.customer.quote, t, telnyxId: r.callRecording.telnyxRecordingId });
      break;
    }
    if (out.length >= n) break;
  }
  return out;
}

async function streamClip(pcm: Buffer, apiKey: string, terms: string[]) {
  const ws = new WebSocket(SONIOX_RT_URL);
  const transcript = new SpeakerTranscript();
  let start = 0;
  let triggerMs = null as number | null;
  let tokenLags: number[] = [];
  let maxSeenEnd = 0;
  const done = new Promise<void>((resolve) => {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { tokens?: SonioxToken[]; finished?: boolean; error_message?: string };
      if (msg.error_message) console.log("  Soniox-fejl:", msg.error_message);
      if (msg.tokens?.length) {
        const now = performance.now();
        transcript.apply(msg.tokens);
        // Kun ord, vi ikke har set før (foreløbige ord sendes igen i hver besked).
        for (const t of msg.tokens) {
          if (!t.end_ms || t.text === "<end>" || t.end_ms <= maxSeenEnd) continue;
          maxSeenEnd = t.end_ms;
          tokenLags.push(now - (start + t.end_ms));
        }
        if (triggerMs === null && detectObjection(transcript.finalText + transcript.interimText)) {
          // Fra det ord, der udløste kortet, blev sagt (Soniox' tidslinje), til kortet er klar.
          triggerMs = now - (start + transcript.lastEndMs);
        }
      }
      if (msg.finished) resolve();
    };
    ws.onclose = () => resolve();
  });
  await new Promise<void>((resolve) => (ws.onopen = () => resolve()));
  ws.send(
    JSON.stringify({
      api_key: apiKey,
      model: "stt-rt-v5",
      audio_format: "pcm_s16le",
      sample_rate: RATE,
      num_channels: 1,
      language_hints: ["da", "en"],
      enable_endpoint_detection: true,
      max_endpoint_delay_ms: 500,
      context: { terms },
    }),
  );
  start = performance.now();
  const chunk = (RATE / 10) * 2; // 100 ms
  for (let off = 0; off < pcm.length; off += chunk) {
    ws.send(pcm.subarray(off, off + chunk));
    const due = start + ((off + chunk) / 2 / RATE) * 1000;
    await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
  }
  ws.send("");
  await done;
  tokenLags = tokenLags.filter((x) => x > -500);
  tokenLags.sort((a, b) => a - b);
  return { triggerMs, tokenLagMedian: tokenLags[Math.floor(tokenLags.length / 2)] ?? null, text: transcript.finalText.trim() };
}

async function main() {
  assertExpectedDatabase();
  const n = Number(arg("--calls") ?? 5);
  const sonioxKey = process.env.SONIOX_API_KEY!.trim();
  const telnyxKey = process.env.TELNYX_API_KEY!.trim();
  const client = createAnthropicClient();
  const system = liveCoachSystemPrompt(await activeScriptResponses(), await objectionBank());
  const samples = await pickSamples(n);
  const results: { category: string; trigger: number | null; ai: number | null; lag: number | null }[] = [];

  for (const s of samples) {
    await withTempDir(async (dir) => {
      const mp3 = path.join(dir, "call.mp3");
      await writeFile(mp3, await fetchTelnyxRecordingMp3(telnyxKey, s.telnyxId));
      const from = Math.max(0, s.t - LEAD_IN_S);
      const raw = path.join(dir, "clip.raw");
      await run("ffmpeg", ["-loglevel", "error", "-ss", String(from), "-t", String(LEAD_IN_S + TAIL_S), "-i", mp3, "-ac", "1", "-ar", String(RATE), "-f", "s16le", raw]);
      const pcm = await readFile(raw);
      const r = await streamClip(pcm, sonioxKey, ["Allio"]);

      const t0 = performance.now();
      let ai: number | null = null;
      const stream = streamSuggestion({ client, system, userMessage: liveCoachUserMessage([{ speaker: "customer", text: r.text.slice(-400) }], s.category as never) });
      const reader = stream.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        if (ai === null && parseCoachText(text).line) ai = performance.now() - t0;
      }
      const card = parseCoachText(text);
      console.log(`\n${s.id} [${s.category}] «${s.quote}»`);
      console.log(`  Soniox token-forsinkelse (median): ${r.tokenLagMedian?.toFixed(0)} ms · straks-kort: ${r.triggerMs?.toFixed(0) ?? "ingen"} ms efter ordene · AI-replik: +${ai?.toFixed(0)} ms efter AI-kaldet`);
      console.log(`  Kort: ${card.signal} · ${card.why} · «${card.line}»`);
      results.push({ category: s.category, trigger: r.triggerMs, ai, lag: r.tokenLagMedian });
    });
  }
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!.toFixed(0) : "–");
  console.log(`\nMedian over ${results.length}: Soniox ${med(results.flatMap((r) => (r.lag === null ? [] : [r.lag])))} ms · straks-kort ${med(results.flatMap((r) => (r.trigger === null ? [] : [r.trigger])))} ms · AI-replik ${med(results.flatMap((r) => (r.ai === null ? [] : [r.ai])))} ms (+ straks-kortets tid)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
