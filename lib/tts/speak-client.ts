"use client";

/**
 * Browser: læs en replik op med ElevenLabs (via /api/tts, streamet), og fald tilbage til browserens
 * danske stemme, hvis det fejler. Kun én replik spiller ad gangen.
 */
let current: HTMLAudioElement | null = null;

export function stopSpeaking() {
  current?.pause();
  current = null;
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
