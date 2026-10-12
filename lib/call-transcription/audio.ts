/**
 * Lyd til transskribering: frisk mp3 fra Telnyx, kanal-info og kanalopdeling med ffmpeg.
 * Filerne ligger kun midlertidigt på VPS'en (withTempDir) og slettes efter brug.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const TELNYX_API_BASE = "https://api.telnyx.com/v2";

/** Henter optagelsens mp3 via en frisk (kortlivet) download-URL fra Telnyx. */
export async function fetchTelnyxRecordingMp3(apiKey: string, recordingId: string): Promise<Buffer> {
  const meta = await fetch(`${TELNYX_API_BASE}/recordings/${encodeURIComponent(recordingId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!meta.ok) throw new Error(`Telnyx-optagelse ${recordingId}: HTTP ${meta.status}`);
  const json = (await meta.json()) as { data?: { download_urls?: { mp3?: string } } };
  const url = json.data?.download_urls?.mp3;
  if (!url) throw new Error(`Telnyx-optagelse ${recordingId}: ingen mp3-URL`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telnyx-download ${recordingId}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "allio-call-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function probeAudio(file: string): Promise<{ channels: number; durationSeconds: number }> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=channels:format=duration",
    "-of",
    "json",
    file,
  ]);
  const j = JSON.parse(stdout) as { streams?: { channels?: number }[]; format?: { duration?: string } };
  return { channels: Number(j.streams?.[0]?.channels ?? 1), durationSeconds: Number(j.format?.duration ?? 0) };
}

/** Deler en stereofil i to monofiler (venstre og højre kanal). */
export async function splitStereo(file: string, dir: string): Promise<{ left: string; right: string }> {
  const left = path.join(dir, "left.mp3");
  const right = path.join(dir, "right.mp3");
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    file,
    "-filter_complex",
    "[0:a]channelsplit=channel_layout=stereo[l][r]",
    "-map",
    "[l]",
    left,
    "-map",
    "[r]",
    right,
  ]);
  return { left, right };
}

/** Gennemsnitlig lydstyrke i dB (−91 ≈ digital stilhed) — bruges til at springe tomme kanaler over. */
export async function meanVolumeDb(file: string): Promise<number> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  return m ? Number(m[1]) : -91;
}
