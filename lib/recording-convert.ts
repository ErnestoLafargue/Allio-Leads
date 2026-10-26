/**
 * Telnyx leverer optagelser som MP3 i det uofficielle format MPEG 2.5 (11 kHz), som Apple (Safari,
 * QuickTime, Finder, iPhone) ikke kan afspille. Workeren på VPS'en (som har ffmpeg) konverterer
 * Blob-kopierne til standard-MP3 (MPEG-1, 44,1 kHz, stadig to spor) og peger links i databasen om.
 * Den gamle fil slettes ikke. Kun til VPS/scripts — bruger ffmpeg via child_process.
 */
import { spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";

/** Markør i filnavnet på konverterede filer (Blob tilføjer selv et tilfældigt suffiks efter). */
export const STANDARD_MARKER = "-std";

/** MPEG-version fra første lydramme: "1", "2", "2.5" eller null (ikke MP3). */
export function mp3Version(buf: Uint8Array): "1" | "2" | "2.5" | null {
  let i = 0;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33 && buf.length > 10) {
    // ID3v2: 10 byte header + syncsafe størrelse
    i = 10 + ((buf[6]! & 0x7f) << 21) + ((buf[7]! & 0x7f) << 14) + ((buf[8]! & 0x7f) << 7) + (buf[9]! & 0x7f);
  }
  for (; i + 1 < buf.length; i++) {
    if (buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0) {
      const v = (buf[i + 1]! >> 3) & 0x3;
      return v === 3 ? "1" : v === 2 ? "2" : v === 0 ? "2.5" : null;
    }
  }
  return null;
}

/** Konverterer til standard-MP3 med ffmpeg (stdin → stdout). */
export function toStandardMp3(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", "pipe:0", "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "64k", "-joint_stereo", "0", "-id3v2_version", "3", "-f", "mp3", "pipe:1"]);
    const out: Buffer[] = [];
    let err = "";
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", (d: Buffer) => (err += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.slice(0, 200)}`))));
    ff.stdin.on("error", () => {});
    ff.stdin.end(input);
  });
}

/** Konverterer op til `limit` Blob-optagelser, nyeste først. Returnerer antal konverterede. */
export async function convertRecordings(limit: number, log: (m: string) => void = () => {}): Promise<{ converted: number; failed: number }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return { converted: 0, failed: 0 };
  const { put } = await import("@vercel/blob");
  const rows = await prisma.leadActivityEvent.findMany({
    where: {
      kind: "CALL_RECORDING",
      recordingUrl: { contains: ".blob.vercel-storage.com/" },
      NOT: { recordingUrl: { contains: `${STANDARD_MARKER}-` } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { recordingUrl: true },
  });
  const urls = [...new Set(rows.map((r) => r.recordingUrl!))];
  let converted = 0;
  let failed = 0;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`hent HTTP ${res.status}`);
      const original = Buffer.from(await res.arrayBuffer());
      const bytes = mp3Version(original) === "1" ? original : await toStandardMp3(original);
      const pathname = new URL(url).pathname.slice(1).replace(/\.mp3$/i, "");
      const blob = await put(`${pathname}${STANDARD_MARKER}.mp3`, bytes, { access: "public", contentType: "audio/mpeg", token });
      await prisma.$transaction([
        prisma.leadActivityEvent.updateMany({ where: { recordingUrl: url }, data: { recordingUrl: blob.url } }),
        prisma.callRecording.updateMany({ where: { playbackUrl: url }, data: { playbackUrl: blob.url } }),
        prisma.dialerCallLog.updateMany({ where: { recordingUrl: url }, data: { recordingUrl: blob.url } }),
      ]);
      converted++;
    } catch (err) {
      failed++;
      log(`Lydfil kunne ikke konverteres (${url.split("/").pop()}): ${err instanceof Error ? err.message : err}`);
    }
  }
  return { converted, failed };
}
