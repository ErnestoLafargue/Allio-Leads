/**
 * Browser: streamer ét lydspor (MediaStream) direkte til Soniox realtime (stt-rt-v5) med en
 * kortlivet nøgle og holder styr på teksten. Lyden går uden om vores servere.
 */
export const SONIOX_RT_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const SAMPLE_RATE = 16000;

export type SonioxToken = { text: string; start_ms?: number; end_ms?: number; is_final: boolean };

/** Tekst for én taler: endelige ord, de foreløbige og den aktuelle ytring (siden seneste <end>). */
export class SpeakerTranscript {
  finalText = "";
  interimText = "";
  private utteranceStart = 0;
  /** Seneste ords slut (ms fra streamens start). */
  lastEndMs = 0;

  /** Opdaterer teksten; returnerer ytringen, hvis taleren lige er holdt op (<end>), ellers null. */
  apply(tokens: readonly SonioxToken[]): string | null {
    let completed: string | null = null;
    let interim = "";
    for (const t of tokens) {
      if (t.text === "<end>") {
        if (t.is_final) {
          completed = this.finalText.slice(this.utteranceStart).trim() || null;
          this.utteranceStart = this.finalText.length;
        }
        continue;
      }
      if (t.end_ms) this.lastEndMs = Math.max(this.lastEndMs, t.end_ms);
      if (t.is_final) this.finalText += t.text;
      else interim += t.text;
    }
    this.interimText = interim;
    return completed;
  }

  /** Den aktuelle (evt. ufærdige) ytring. */
  get utterance(): string {
    return (this.finalText.slice(this.utteranceStart) + this.interimText).trim();
  }
}

const WORKLET = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-tap", PcmTap);
`;

export type SonioxStream = { startedAt: number; stop: () => void };

export async function startSonioxStream(params: {
  apiKey: string;
  stream: MediaStream;
  terms: string[];
  onTokens: (tokens: SonioxToken[]) => void;
  onError: (message: string) => void;
}): Promise<SonioxStream> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const source = ctx.createMediaStreamSource(params.stream);
  const tap = new AudioWorkletNode(ctx, "pcm-tap");
  // Stille udgang, så browseren altid kører noden (vi afspiller ikke lyden her).
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(tap).connect(mute).connect(ctx.destination);

  const ws = new WebSocket(SONIOX_RT_URL);
  let open = false;
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  const startedAt = performance.now();

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        api_key: params.apiKey,
        model: "stt-rt-v5",
        audio_format: "pcm_s16le",
        sample_rate: SAMPLE_RATE,
        num_channels: 1,
        language_hints: ["da", "en"],
        enable_endpoint_detection: true,
        max_endpoint_delay_ms: 500,
        context: { terms: params.terms },
      }),
    );
    open = true;
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { tokens?: SonioxToken[]; error_message?: string };
      if (msg.error_message) params.onError(msg.error_message);
      else if (msg.tokens?.length) params.onTokens(msg.tokens);
    } catch {
      /* ignorer ugyldige beskeder */
    }
  };
  ws.onerror = () => params.onError("Forbindelsen til Soniox fejlede");

  // ~100 ms pr. pakke: nok til lav forsinkelse uden for mange små beskeder.
  tap.port.onmessage = (ev: MessageEvent<Float32Array>) => {
    const f = ev.data;
    const pcm = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i]!)) * 0x7fff;
    pending.push(pcm);
    pendingSamples += pcm.length;
    if (!open || pendingSamples < SAMPLE_RATE / 10) return;
    const out = new Int16Array(pendingSamples);
    let o = 0;
    for (const p of pending) {
      out.set(p, o);
      o += p.length;
    }
    pending = [];
    pendingSamples = 0;
    if (ws.readyState === WebSocket.OPEN) ws.send(out.buffer);
  };

  return {
    startedAt,
    stop: () => {
      tap.port.onmessage = null;
      source.disconnect();
      void ctx.close();
      if (ws.readyState === WebSocket.OPEN) ws.send(new ArrayBuffer(0));
      setTimeout(() => ws.close(), 1500);
    },
  };
}
