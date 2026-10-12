/**
 * Transskriberer én CallRecording med Soniox og gemmer segmenter i CallTranscript.
 *
 * - Stereo (Telnyx-profilen "dual" siden 26/9): kanalerne deles med ffmpeg og transskriberes
 *   hver for sig — venstre = sælger, højre = kunde på udgående opkald. Tavse kanaler springes over.
 * - Mono (historikken): Soniox' talerskelnen, og sælgeren findes med identifyAgentLabel.
 * - Samtaler med under MIN_WORDS ord får status NO_SPEECH og springes over i analysen.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { fetchTelnyxRecordingMp3, meanVolumeDb, probeAudio, splitStereo, withTempDir } from "./audio";
import {
  assignRoles,
  dominantLanguage,
  groupTokens,
  identifyAgentLabel,
  sortSegments,
  talkSeconds,
  wordCount,
  type TimedToken,
  type TranscriptSegment,
} from "./segments";
import { SONIOX_ASYNC_MODEL, SONIOX_USD_PER_HOUR, transcribeWithSoniox, type SonioxToken } from "./soniox";

export const MIN_WORDS = 5;
/** Under dette gennemsnitsniveau regnes en kanal som tavs (power dialerens fejl-optagelser: −90 dB). */
const SILENT_CHANNEL_DB = -60;

export type TranscribeOutcome = {
  status: "TRANSCRIBED" | "NO_SPEECH";
  mode: "stereo_split" | "mono_diarized";
  words: number;
  costUsd: number;
};

function toTimed(tokens: readonly SonioxToken[]): TimedToken[] {
  return tokens
    .filter((t) => !t.is_audio_event)
    .map((t) => ({ text: t.text, startMs: t.start_ms, endMs: t.end_ms, label: t.speaker ?? null }));
}

function countLanguages(tokens: readonly SonioxToken[], into: Record<string, number>): void {
  for (const t of tokens) if (t.language) into[t.language] = (into[t.language] ?? 0) + 1;
}

export async function transcribeCallRecording(
  callRecordingId: string,
  keys: { telnyxApiKey: string; sonioxApiKey: string },
): Promise<TranscribeOutcome> {
  const rec = await prisma.callRecording.findUniqueOrThrow({
    where: { id: callRecordingId },
    select: { id: true, telnyxRecordingId: true, direction: true, agent: { select: { name: true } } },
  });
  const agentName = rec.agent?.name?.trim() || null;
  const terms = ["Allio", ...(agentName ? [agentName] : [])];
  const mp3 = await fetchTelnyxRecordingMp3(keys.telnyxApiKey, rec.telnyxRecordingId);

  return withTempDir(async (dir) => {
    const file = path.join(dir, "call.mp3");
    await writeFile(file, mp3);
    const info = await probeAudio(file);
    const languages: Record<string, number> = {};
    let billedSeconds = 0;
    let segments: TranscriptSegment[];
    let mode: TranscribeOutcome["mode"];

    if (info.channels >= 2) {
      mode = "stereo_split";
      const { left, right } = await splitStereo(file, dir);
      // Verificeret på udgående opkald: venstre = sælger. Indgående antages spejlvendt (ikke set endnu).
      const channels =
        rec.direction === "inbound"
          ? ([["customer", left], ["agent", right]] as const)
          : ([["agent", left], ["customer", right]] as const);
      const parts: TranscriptSegment[] = [];
      for (const [role, channelFile] of channels) {
        if ((await meanVolumeDb(channelFile)) < SILENT_CHANNEL_DB) continue;
        const r = await transcribeWithSoniox({
          apiKey: keys.sonioxApiKey,
          audio: await readFile(channelFile),
          filename: `${rec.id}-${role}.mp3`,
          diarize: false,
          terms,
        });
        billedSeconds += r.audioSeconds;
        countLanguages(r.tokens, languages);
        parts.push(...groupTokens(toTimed(r.tokens)).map((s) => ({ speaker: role, start: s.start, end: s.end, text: s.text })));
      }
      segments = sortSegments(parts);
    } else {
      mode = "mono_diarized";
      const r = await transcribeWithSoniox({
        apiKey: keys.sonioxApiKey,
        audio: mp3,
        filename: `${rec.id}.mp3`,
        diarize: true,
        terms,
      });
      billedSeconds = r.audioSeconds;
      countLanguages(r.tokens, languages);
      const labeled = groupTokens(toTimed(r.tokens));
      segments = assignRoles(labeled, identifyAgentLabel(labeled, agentName?.split(/\s+/)[0] ?? null));
    }

    const words = wordCount(segments);
    const costUsd = (billedSeconds / 3600) * SONIOX_USD_PER_HOUR;
    const status: TranscribeOutcome["status"] = words < MIN_WORDS ? "NO_SPEECH" : "TRANSCRIBED";
    const data = {
      provider: "soniox",
      model: SONIOX_ASYNC_MODEL,
      mode,
      language: dominantLanguage(languages),
      languages,
      segments,
      wordCount: words,
      agentTalkSeconds: talkSeconds(segments, "agent"),
      customerTalkSeconds: talkSeconds(segments, "customer"),
      billedAudioSeconds: billedSeconds,
      costUsd,
    };
    await prisma.$transaction([
      prisma.callTranscript.upsert({
        where: { callRecordingId: rec.id },
        create: { callRecordingId: rec.id, ...data },
        update: data,
      }),
      prisma.callRecording.update({ where: { id: rec.id }, data: { pipelineStatus: status, pipelineError: null } }),
    ]);
    return { status, mode, words, costUsd };
  });
}
