/**
 * Mono-afspilning af stereo-optagelser (sælger venstre, kunde højre): kanalerne lægges sammen i
 * browseren, så begge parter høres i begge ører — filen forbliver stereo (til AI og download).
 * Kræver CORS på lydfilen (Vercel Blob sender `Access-Control-Allow-Origin: *`) eller samme origin
 * (fx /api/call-recordings/…/audio). Andre links afspilles som almindelig stereo.
 */
export function supportsMonoPlayback(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    return new URL(src).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export type MonoPlayback = {
  /** Kobler <audio> til mono-grafen (første gang ved Afspil — kræver bruger-gesture). */
  ensure: (el: HTMLAudioElement) => void;
  suspend: () => void;
  close: () => void;
};

export function createMonoPlayback(): MonoPlayback {
  let state: { ctx: AudioContext; el: HTMLAudioElement; source: MediaElementAudioSourceNode } | null = null;
  return {
    ensure(el) {
      if (typeof AudioContext === "undefined") return;
      if (state?.el === el) {
        void state.ctx.resume();
        return;
      }
      try {
        const ctx = state?.ctx ?? new AudioContext();
        state?.source.disconnect();
        const source = ctx.createMediaElementSource(el);
        // Læg venstre og højre sammen til én kanal, som destinationen spreder ud på begge ører —
        // samme lydstyrke som mono-optagelser. Mono-filer (kun kanal 0) går uændret igennem.
        const split = ctx.createChannelSplitter(2);
        const mono = ctx.createGain();
        mono.channelCount = 1;
        mono.channelCountMode = "explicit";
        source.connect(split);
        split.connect(mono, 0);
        split.connect(mono, 1);
        mono.connect(ctx.destination);
        state = { ctx, el, source };
        void ctx.resume();
      } catch {
        // Web Audio utilgængelig — afspil som almindelig stereo.
      }
    },
    suspend() {
      void state?.ctx.suspend().catch(() => {});
    },
    close() {
      void state?.ctx.close().catch(() => {});
      state = null;
    },
  };
}
