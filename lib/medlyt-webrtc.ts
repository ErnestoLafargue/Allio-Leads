/** Fælles WebRTC-hjælpere til browser-Medlyt. */

export const MEDLYT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Lav jitter-buffer på admin-siden (~40 ms i stedet for Chromes default ~120–200). */
export const MEDLYT_JITTER_TARGET_MS = 40;

/** Chrome kræver CRLF efter hver SDP-linje — også den sidste. */
export function normalizeMedlytSdp(sdp: string): string {
  const lines = sdp
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  return `${lines.join("\r\n")}\r\n`;
}

export function createMedlytPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: MEDLYT_ICE_SERVERS,
    iceCandidatePoolSize: 4,
    bundlePolicy: "max-bundle",
  });
}

/** Foretræk Opus uden RED/CN/DTMF — lavere encode-delay. */
export function preferMedlytOpus(pc: RTCPeerConnection): void {
  const caps = RTCRtpSender.getCapabilities?.("audio");
  if (!caps?.codecs?.length) return;
  const opus = caps.codecs.filter((c) => c.mimeType.toLowerCase() === "audio/opus");
  const rest = caps.codecs.filter((c) => {
    const m = c.mimeType.toLowerCase();
    return m !== "audio/opus" && !m.includes("telephone-event") && !m.includes("red") && !m.includes("cn");
  });
  const ordered = [...opus, ...rest];
  if (!ordered.length) return;
  for (const t of pc.getTransceivers()) {
    try {
      t.setCodecPreferences(ordered);
    } catch {
      /* ældre browser */
    }
  }
}

export function applyMedlytLowDelay(receiver: RTCRtpReceiver): void {
  try {
    (receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget =
      MEDLYT_JITTER_TARGET_MS;
  } catch {
    /* ældre browser */
  }
}

export function liveAudioTrack(stream: MediaStream | null): MediaStreamTrack | null {
  return stream?.getAudioTracks().find((t) => t.readyState === "live") ?? null;
}
