/** Fælles WebRTC-hjælpere til browser-Medlyt. */

export const MEDLYT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Lav jitter-buffer — Chromes default er ofte 120–200 ms. */
export const MEDLYT_JITTER_TARGET_MS = 20;

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

/** Stille spor så et send-m-line ikke bliver `inactive` før Telnyx-remote findes. */
export function createSilentAudioTrack(): { track: MediaStreamTrack; stop: () => void } {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(dest);
  osc.start();
  const track = dest.stream.getAudioTracks()[0]!;
  return {
    track,
    stop: () => {
      try {
        osc.stop();
      } catch {
        /* no-op */
      }
      try {
        void ctx.close();
      } catch {
        /* no-op */
      }
      try {
        track.stop();
      } catch {
        /* no-op */
      }
    },
  };
}

export function sdpDirectionSummary(sdp: string): string {
  const dirs = [...sdp.matchAll(/a=(sendonly|recvonly|sendrecv|inactive)/g)].map((m) => m[1]);
  return dirs.join(",");
}

/** Vent til ICE er samlet (hele SDP) så vi ikke er afhængige af langsom trickle-poll. */
export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 700): Promise<number> {
  const started = Date.now();
  if (pc.iceGatheringState === "complete") return Promise.resolve(0);
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", onChange);
      window.clearTimeout(timer);
      resolve(Date.now() - started);
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = window.setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

export function attachMedlytPlayback(
  el: HTMLAudioElement | null,
  track: MediaStreamTrack,
): void {
  if (!el) return;
  const prev = el.srcObject;
  if (prev instanceof MediaStream && prev.getTracks()[0]?.id === track.id) {
    void el.play().catch(() => undefined);
    return;
  }
  el.srcObject = new MediaStream([track]);
  void el.play().catch(() => undefined);
}
