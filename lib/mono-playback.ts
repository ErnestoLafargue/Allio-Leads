/**
 * Afspilning af dual-track optagelser (sælger på det ene spor, kunde på det andet).
 *
 * Filen gemmes uændret med 2 spor. I browseren lægges sporene sammen og sendes som
 * stereo til højttalerne, så begge stemmer høres i begge sider.
 *
 * Kræver CORS på lydfilen (Vercel Blob sender `Access-Control-Allow-Origin: *`) eller
 * samme origin (fx /api/leads/call-recordings/…/audio). Andre links afspilles nativt.
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
  /** Kobler <audio> til mix-grafen (første gang ved Afspil — kræver bruger-gesture). */
  ensure: (el: HTMLAudioElement) => void;
  suspend: () => void;
  close: () => void;
};

/**
 * Læg spor 0 og spor 1 sammen og send mixet til både venstre og højre udgang.
 * Gain 0.7 undgår clipping når to fuldt udstyrede spor summeres.
 */
export function connectDualTrackToStereoSpeakers(
  ctx: AudioContext,
  source: MediaElementAudioSourceNode,
): void {
  const split = ctx.createChannelSplitter(2);
  const trackA = ctx.createGain();
  const trackB = ctx.createGain();
  trackA.gain.value = 0.7;
  trackB.gain.value = 0.7;
  const merger = ctx.createChannelMerger(2);
  source.connect(split);
  split.connect(trackA, 0);
  split.connect(trackB, 1);
  trackA.connect(merger, 0, 0);
  trackA.connect(merger, 0, 1);
  trackB.connect(merger, 0, 0);
  trackB.connect(merger, 0, 1);
  merger.connect(ctx.destination);
}

export function createMonoPlayback(): MonoPlayback {
  let state: { ctx: AudioContext; el: HTMLAudioElement; source: MediaElementAudioSourceNode } | null =
    null;
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
        connectDualTrackToStereoSpeakers(ctx, source);
        state = { ctx, el, source };
        void ctx.resume();
      } catch {
        // Web Audio utilgængelig — afspil som almindelig split-stereo.
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
