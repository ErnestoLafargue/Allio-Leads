"use client";

import { useEffect, useState } from "react";

/**
 * Web Audio niveau-måler: returnerer en værdi 0..1 baseret på RMS-amplitude
 * af den givne MediaStream. Resultatet er let komprimeret så normal samtale
 * fylder bjælken pænt (~0.4–0.7) uden at gå i loftet.
 *
 * Kald med `null` for at slukke. Returnerer 0 hvis stream'en mangler audio-tracks.
 */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      return;
    }
    const AC =
      typeof window !== "undefined" &&
      ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    let raf = 0;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
    } catch {
      try {
        ctx.close();
      } catch {
        /* no-op */
      }
      return;
    }
    const buffer = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const scaled = Math.min(1, rms * 3.2);
      setLevel(scaled);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      try {
        source?.disconnect();
      } catch {
        /* no-op */
      }
      try {
        analyser?.disconnect();
      } catch {
        /* no-op */
      }
      try {
        void ctx.close();
      } catch {
        /* no-op */
      }
      setLevel(0);
    };
  }, [stream]);

  return level;
}
