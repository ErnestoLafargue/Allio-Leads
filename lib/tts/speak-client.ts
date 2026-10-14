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
        .then(async (r) => {
          if (!r.ok) handlers.onError?.(`${r.status}: ${(await r.text()).slice(0, 200)}`);
        })
        .catch(() => handlers.onError?.("ingen forbindelse"));
  };
  void audio.play().catch(() => {
    if (current === audio) browserSpeak(text);
  });
  return audio;
}

let activeQueue: SpeechQueue | null = null;

/**
 * Afspiller sætninger i rækkefølge, efterhånden som de kommer (streamet fra Claude). Hver bid hentes fra
 * /api/tts, så snart den er klar, så næste er klar, når den forrige slutter.
 * - `stitching` (Flash o.l.): hver sætning sendes med teksten før (previous_text), så tonen hænger sammen.
 * - Uden (v3): første sætning sendes straks, resten samles til én bid, så tonen højst skifter én gang.
 * Fejler ElevenLabs, læses bidden op med browserens stemme, og onError får årsagen (én gang).
 */
export class SpeechQueue {
  /** Bidder, der venter; lyden hentes først, når bidden er den næste (højst én ud over den, der spiller). */
  private queue: { text: string; url: string; audio: HTMLAudioElement | null }[] = [];
  private said: string[] = [];
  private buffer: string[] = [];
  private playing: HTMLAudioElement | null = null;
  private finished = false;
  private stopped = false;
  private started = false;
  private reportedError = false;

  constructor(
    private voice: string,
    private handlers: { onFirstPlaying?: () => void; onIdle?: () => void; onError?: (reason: string) => void } = {},
    private stitching = true,
  ) {
    stopSpeaking();
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- den aktive kø skal kunne stoppes fra stopSpeaking()
    activeQueue = this;
  }

  add(text: string) {
    if (this.stopped || !text.trim()) return;
    // v3: første sætning straks, resten samles (sendes, når den forrige bid er spillet, eller til sidst).
    if (!this.stitching && this.said.length > 0) {
      this.buffer.push(text);
      if (!this.playing && !this.queue.length) this.next();
      return;
    }
    this.enqueue(text);
    if (!this.playing) this.next();
    else this.prefetch();
  }

  /** Der kommer ikke flere sætninger. */
  finish() {
    this.finished = true;
    if (!this.playing) this.next();
  }

  stop() {
    this.stopped = true;
    this.playing?.pause();
    this.playing = null;
    for (const q of this.queue) {
      if (!q.audio) continue;
      q.audio.onerror = null;
      q.audio.removeAttribute("src");
      q.audio.load();
    }
    this.queue = [];
    this.buffer = [];
  }

  private enqueue(text: string) {
    const prev = this.stitching ? this.said.join(" ").slice(-400) : "";
    this.said.push(text);
    const url = `/api/tts?voice=${encodeURIComponent(this.voice)}&text=${encodeURIComponent(text)}${prev ? `&prev=${encodeURIComponent(prev)}` : ""}`;
    this.queue.push({ text, url, audio: null });
  }

  private makeAudio(item: { text: string; url: string; audio: HTMLAudioElement | null }): HTMLAudioElement {
    if (item.audio) return item.audio;
    const audio = new Audio(item.url);
    audio.preload = "auto";
    audio.onerror = () => {
      // Stoppet med vilje (afbrudt eller lagt på): ingen fejl.
      if (this.stopped) return;
      if (!this.reportedError && this.handlers.onError) {
        this.reportedError = true;
        void fetch(item.url)
          .then(async (r) => {
            // Kun en rigtig fejl fra serveren/ElevenLabs vises (ikke selve lyden).
            if (!r.ok) this.handlers.onError?.(`${r.status}: ${(await r.text()).slice(0, 200)}`);
          })
          .catch(() => this.handlers.onError?.("ingen forbindelse"));
      }
      if (this.playing === audio) {
        browserSpeak(item.text);
        this.next();
      }
    };
    item.audio = audio;
    return audio;
  }

  /** Hent den næste bid, mens den nuværende spiller (kun én ad gangen, så ElevenLabs' loft for samtidige kald ikke rammes). */
  private prefetch() {
    const nextItem = this.queue[0];
    if (nextItem && !nextItem.audio) this.makeAudio(nextItem);
  }

  private idle() {
    if (activeQueue === this) activeQueue = null;
    if (!this.stopped) this.handlers.onIdle?.();
  }

  private next() {
    if (this.stopped) return;
    this.playing = null;
    if (!this.queue.length && this.buffer.length) {
      const text = this.buffer.join(" ");
      this.buffer = [];
      this.enqueue(text);
    }
    const item = this.queue.shift();
    if (!item) {
      if (this.finished) this.idle();
      return;
    }
    const audio = this.makeAudio(item);
    this.playing = audio;
    audio.onplaying = () => {
      if (!this.started) {
        this.started = true;
        this.handlers.onFirstPlaying?.();
      }
    };
    audio.onended = () => {
      if (this.playing === audio) this.next();
    };
    void audio.play().catch(() => {
      if (this.stopped || this.playing !== audio) return;
      browserSpeak(item.text);
      this.next();
    });
    this.prefetch();
  }
}
