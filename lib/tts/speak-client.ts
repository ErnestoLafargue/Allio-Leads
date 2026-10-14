"use client";

/**
 * Browser: læs en replik op med ElevenLabs (via /api/tts, streamet), og fald tilbage til browserens
 * danske stemme, hvis det fejler. Kun én replik spiller ad gangen.
 */
let current: HTMLAudioElement | null = null;

export function stopSpeaking() {
  current?.pause();
  current = null;
  activeQueue?.stop();
  activeQueue = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ingen oplæsning */
  }
}

function browserSpeak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/\[[^\]]*\]/g, " "));
    u.lang = "da-DK";
    window.speechSynthesis.speak(u);
  } catch {
    /* ingen oplæsning i denne browser */
  }
}

/**
 * Afspiller teksten. `voice`: en agentstemme (fx christian-v3c) eller "kunde". Kalder onPlaying ved første
 * lyd. Fejler ElevenLabs, læses teksten op med browserens stemme, og onError får årsagen fra serveren.
 */
export function speak(
  text: string,
  voice = "kunde",
  handlers: { onPlaying?: () => void; onEnded?: () => void; onError?: (reason: string) => void } = {},
): HTMLAudioElement | null {
  stopSpeaking();
  if (!text.trim()) return null;
  const url = `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
  const audio = new Audio(url);
  current = audio;
  audio.onplaying = () => handlers.onPlaying?.();
  audio.onended = () => {
    if (current === audio) current = null;
    handlers.onEnded?.();
  };
  audio.onerror = () => {
    if (current !== audio) return;
    current = null;
    browserSpeak(text);
    handlers.onEnded?.();
    if (handlers.onError)
      void fetch(url)
        .then(async (r) => handlers.onError?.(`${r.status}: ${(await r.text()).slice(0, 200)}`))
        .catch(() => handlers.onError?.("ingen forbindelse"));
  };
  void audio.play().catch(() => {
    if (current === audio) browserSpeak(text);
  });
  return audio;
}

let activeQueue: SpeechQueue | null = null;

/**
 * Afspiller sætninger i rækkefølge, efterhånden som de kommer (streamet fra Claude). Hver sætning hentes
 * fra /api/tts, så snart den kommer, så næste er klar, når den forrige slutter. Fejler ElevenLabs for en
 * sætning, læses den op med browserens stemme, og onError får årsagen (én gang).
 */
export class SpeechQueue {
  private queue: { text: string; audio: HTMLAudioElement }[] = [];
  private playing: HTMLAudioElement | null = null;
  private finished = false;
  private stopped = false;
  private started = false;
  private reportedError = false;

  constructor(
    private voice: string,
    private handlers: { onFirstPlaying?: () => void; onIdle?: () => void; onError?: (reason: string) => void } = {},
  ) {
    stopSpeaking();
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- den aktive kø skal kunne stoppes fra stopSpeaking()
    activeQueue = this;
  }

  add(text: string) {
    if (this.stopped || !text.trim()) return;
    const url = `/api/tts?voice=${encodeURIComponent(this.voice)}&text=${encodeURIComponent(text)}`;
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.onerror = () => {
      if (!this.reportedError && this.handlers.onError) {
        this.reportedError = true;
        void fetch(url)
          .then(async (r) => this.handlers.onError?.(`${r.status}: ${(await r.text()).slice(0, 200)}`))
          .catch(() => this.handlers.onError?.("ingen forbindelse"));
      }
      if (this.playing === audio) {
        this.playing = null;
        browserSpeak(text);
        this.next();
      }
    };
    this.queue.push({ text, audio });
    if (!this.playing) this.next();
  }

  /** Der kommer ikke flere sætninger. */
  finish() {
    this.finished = true;
    if (!this.playing && !this.queue.length) this.idle();
  }

  stop() {
    this.stopped = true;
    this.playing?.pause();
    this.playing = null;
    for (const q of this.queue) q.audio.src = "";
    this.queue = [];
  }

  private idle() {
    if (activeQueue === this) activeQueue = null;
    if (!this.stopped) this.handlers.onIdle?.();
  }

  private next() {
    if (this.stopped) return;
    const item = this.queue.shift();
    if (!item) {
      this.playing = null;
      if (this.finished) this.idle();
      return;
    }
    this.playing = item.audio;
    item.audio.onplaying = () => {
      if (!this.started) {
        this.started = true;
        this.handlers.onFirstPlaying?.();
      }
    };
    item.audio.onended = () => this.next();
    void item.audio.play().catch(() => {
      browserSpeak(item.text);
      this.next();
    });
  }
}
