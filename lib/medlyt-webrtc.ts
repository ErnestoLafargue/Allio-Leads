/** Fælles WebRTC-hjælpere til browser-Medlyt. */

export const MEDLYT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Lav jitter-buffer — Chromes default er ofte 120–200 ms. */
export const MEDLYT_JITTER_TARGET_MS = 10;

/** 10 ms Opus-rammer — default er 20 ms plus FEC. */
export const MEDLYT_PTIME_MS = 10;

type MedlytAudioConstraints = MediaTrackConstraints & { latency?: number };

/** Admin-mic: AEC ja (ellers hører sælger sig selv), AGC/NS slået fra (de koster delay). */
export const MEDLYT_TALK_AUDIO_CONSTRAINTS: MedlytAudioConstraints = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
  latency: 0.01,
};

/** Sælger-capture: kun kortere buffer — AGC/NS røres ikke (går også til kunden). */
export function medlytSellerCaptureConstraints(deviceId?: string | null): MedlytAudioConstraints {
  return {
    echoCancellation: true,
    channelCount: 1,
    latency: 0.01,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

type AudioContextWithSink = AudioContext & { setSinkId?: (id: string) => Promise<void> };

type PlaybackBind = {
  ctx: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  trackId: string | null;
};

const playbackBinds = new WeakMap<HTMLAudioElement, PlaybackBind>();

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

/** 10 ms ptime, ingen FEC/DTX — mindre encode-delay. */
export function applyMedlytLowDelaySdp(sdp: string): string {
  const lines = normalizeMedlytSdp(sdp).trimEnd().split("\r\n");
  const opusPts = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+)\s+opus\//i);
    if (m) opusPts.add(m[1]);
  }

  const out: string[] = [];
  let inAudio = false;
  let sawPtime = false;
  let sawMaxPtime = false;
  const seenOpusFmtp = new Set<string>();

  const flushAudioExtras = () => {
    if (!inAudio) return;
    for (const pt of opusPts) {
      if (!seenOpusFmtp.has(pt)) {
        out.push(`a=fmtp:${pt} minptime=${MEDLYT_PTIME_MS};useinbandfec=0;usedtx=0`);
      }
    }
    if (!sawPtime) out.push(`a=ptime:${MEDLYT_PTIME_MS}`);
    if (!sawMaxPtime) out.push(`a=maxptime:${MEDLYT_PTIME_MS}`);
    sawPtime = false;
    sawMaxPtime = false;
    seenOpusFmtp.clear();
  };

  for (const line of lines) {
    if (line.startsWith("m=")) {
      flushAudioExtras();
      inAudio = line.startsWith("m=audio");
      out.push(line);
      continue;
    }
    if (inAudio && /^a=ptime:/i.test(line)) {
      out.push(`a=ptime:${MEDLYT_PTIME_MS}`);
      sawPtime = true;
      continue;
    }
    if (inAudio && /^a=maxptime:/i.test(line)) {
      out.push(`a=maxptime:${MEDLYT_PTIME_MS}`);
      sawMaxPtime = true;
      continue;
    }
    if (inAudio && line.startsWith("a=fmtp:")) {
      const m = line.match(/^a=fmtp:(\d+)\s*(.*)$/);
      if (m && opusPts.has(m[1])) {
        const map = new Map<string, string>();
        for (const part of m[2].split(";")) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const eq = trimmed.indexOf("=");
          if (eq === -1) map.set(trimmed, "");
          else map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
        }
        map.set("minptime", String(MEDLYT_PTIME_MS));
        map.set("useinbandfec", "0");
        map.set("usedtx", "0");
        const fmtp = [...map.entries()]
          .map(([k, v]) => (v === "" ? k : `${k}=${v}`))
          .join(";");
        out.push(`a=fmtp:${m[1]} ${fmtp}`);
        seenOpusFmtp.add(m[1]);
        continue;
      }
    }
    out.push(line);
  }
  flushAudioExtras();
  return `${out.join("\r\n")}\r\n`;
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
  const opus = caps.codecs
    .filter((c) => c.mimeType.toLowerCase() === "audio/opus")
    .map((c) => ({
      ...c,
      sdpFmtpLine: `minptime=${MEDLYT_PTIME_MS};useinbandfec=0;usedtx=0`,
    }));
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
  const ext = receiver as RTCRtpReceiver & {
    jitterBufferTarget?: number;
    playoutDelayHint?: number;
  };
  try {
    ext.jitterBufferTarget = MEDLYT_JITTER_TARGET_MS;
  } catch {
    /* ældre browser */
  }
  try {
    ext.playoutDelayHint = 0;
  } catch {
    /* ældre browser */
  }
}

export function applyMedlytSendLowDelay(sender: RTCRtpSender): void {
  try {
    const params = sender.getParameters();
    const encodings = params.encodings?.length ? params.encodings : [{}];
    for (const enc of encodings) {
      enc.priority = "high";
      (enc as RTCRtpEncodingParameters & { networkPriority?: "high" }).networkPriority = "high";
      enc.maxBitrate = 48_000;
    }
    params.encodings = encodings;
    void sender.setParameters(params).catch(() => undefined);
  } catch {
    /* ældre browser */
  }
}

export function applyMedlytSpeechHint(track: MediaStreamTrack | null): void {
  if (!track) return;
  try {
    (track as MediaStreamTrack & { contentHint?: string }).contentHint = "speech";
  } catch {
    /* ældre browser */
  }
}

export function liveAudioTrack(stream: MediaStream | null): MediaStreamTrack | null {
  return stream?.getAudioTracks().find((t) => t.readyState === "live") ?? null;
}

/** Stille spor så et send-m-line ikke bliver `inactive` før Telnyx-remote findes. */
export function createSilentAudioTrack(): { track: MediaStreamTrack; stop: () => void } {
  const ctx = new AudioContext({ latencyHint: "interactive" });
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

function playViaElement(el: HTMLAudioElement, track: MediaStreamTrack, sinkId?: string | null): void {
  el.muted = false;
  const prev = el.srcObject;
  if (!(prev instanceof MediaStream && prev.getTracks()[0]?.id === track.id)) {
    el.srcObject = new MediaStream([track]);
  }
  void el.play().catch(() => undefined);
  const sink = sinkId?.trim();
  if (!sink) return;
  const setSink = (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (typeof setSink === "function") {
    void setSink.call(el, sink).catch(() => undefined);
  }
}

export function detachMedlytPlayback(el: HTMLAudioElement | null): void {
  if (!el) return;
  const bind = playbackBinds.get(el);
  if (bind) {
    try {
      bind.source?.disconnect();
    } catch {
      /* no-op */
    }
    if (bind.ctx) {
      void bind.ctx.close().catch(() => undefined);
    }
    playbackBinds.delete(el);
  }
  el.srcObject = null;
  el.muted = false;
}

/**
 * Afspil via Web Audio (`interactive`) — `<audio>` bufferer ofte 80–200 ms ekstra.
 * Falder tilbage til elementet hvis AudioContext ikke kan starte.
 */
export function attachMedlytPlayback(
  el: HTMLAudioElement | null,
  track: MediaStreamTrack,
  sinkId?: string | null,
  debugSessionId?: string | null,
): void {
  if (!el) return;
  let bind = playbackBinds.get(el);
  if (bind?.trackId === track.id && bind.source) {
    void bind.ctx?.resume().catch(() => undefined);
    return;
  }
  if (bind?.source) {
    try {
      bind.source.disconnect();
    } catch {
      /* no-op */
    }
    bind.source = null;
  }
  if (!bind) {
    bind = { ctx: null, source: null, trackId: null };
    playbackBinds.set(el, bind);
  }

  const useElement = () => playViaElement(el, track, sinkId);

  try {
    if (!bind.ctx || bind.ctx.state === "closed") {
      bind.ctx = new AudioContext({ latencyHint: "interactive" });
    }
    const ctx = bind.ctx;
    const sink = sinkId?.trim();
    if (sink && typeof (ctx as AudioContextWithSink).setSinkId === "function") {
      void (ctx as AudioContextWithSink).setSinkId!(sink).catch(() => undefined);
    }
    void ctx
      .resume()
      .then(() => {
        const usingWa = ctx.state === "running";
        // #region agent log
        fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
          body: JSON.stringify({
            sessionId: "c1392e",
            hypothesisId: "H-play",
            location: "medlyt-webrtc.ts:attachMedlytPlayback",
            message: "playback bind",
            data: {
              usingWa,
              ctxState: ctx.state,
              trackMuted: track.muted,
              readyState: track.readyState,
              hasEl: true,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        if (debugSessionId) {
          fetch(`/api/dialer/medlyt/listen/${debugSessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientDebug: {
                hypothesisId: "H-play",
                location: "medlyt-webrtc.ts:attachMedlytPlayback",
                message: "playback bind",
                data: {
                  usingWa,
                  ctxState: ctx.state,
                  trackMuted: track.muted,
                  readyState: track.readyState,
                },
              },
            }),
          }).catch(() => {});
        }
        // #endregion
        if (!usingWa) {
          useElement();
          return;
        }
        const src = ctx.createMediaStreamSource(new MediaStream([track]));
        src.connect(ctx.destination);
        bind.source = src;
        bind.trackId = track.id;
        el.srcObject = null;
        el.muted = true;
      })
      .catch(useElement);
  } catch {
    useElement();
  }
}
