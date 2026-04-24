"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  src: string;
  /** Fra Telnyx webhook / DB — vises indtil metadata er indlæst */
  durationSecondsHint?: number | null;
  /** visuel variant */
  variant?: "default" | "adminInline";
};

/**
 * Afspiller samtaleoptagelse med tydelig varighed, play/pause og scrub (slider).
 */
export function LeadRecordingPlayer({ src, durationSecondsHint, variant = "default" }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState<number | null>(
    typeof durationSecondsHint === "number" && durationSecondsHint > 0
      ? durationSecondsHint
      : null,
  );
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(0);
    setPlaying(false);
    setReady(false);
    setError(null);
    if (typeof durationSecondsHint === "number" && durationSecondsHint > 0) {
      setDuration(durationSecondsHint);
    } else {
      setDuration(null);
    }
  }, [src, durationSecondsHint]);

  const onMeta = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
    setReady(true);
    setError(null);
  }, []);

  const onTime = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setCurrent(0);
    const el = audioRef.current;
    if (el) el.currentTime = 0;
  }, []);

  const onErr = useCallback(() => {
    setError("Kunne ikke indlæse lydfilen (tjek netværk eller om linket er udløbet).");
    setReady(false);
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      void el.pause();
      setPlaying(false);
    } else {
      void el.play().then(
        () => setPlaying(true),
        () => setError("Afspilning blev blokeret eller fejlede."),
      );
    }
  }, [playing]);

  const seekTo = useCallback((value: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(value)) return;
    const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration ?? 0;
    const t = Math.min(Math.max(0, value), max || 0);
    el.currentTime = t;
    setCurrent(t);
  }, [duration]);

  const total = duration ?? 0;
  const sliderMax = total > 0 ? total : Math.max(current, 1);

  const wrap =
    variant === "adminInline"
      ? "rounded-lg border border-blue-200/90 bg-blue-50/50 p-2"
      : "rounded-lg border border-stone-200 bg-stone-100/60 p-2";

  return (
    <div className={`mt-2 ${wrap}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={onMeta}
        onDurationChange={onMeta}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onError={onErr}
        aria-hidden
      >
        <track kind="captions" />
      </audio>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={!src || !!error}
          className="inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-md bg-stone-800 px-2.5 text-xs font-semibold text-white shadow-sm hover:bg-stone-900 disabled:opacity-40"
          aria-label={playing ? "Pause" : "Afspil"}
        >
          {playing ? "Pause" : "Afspil"}
        </button>
        <span className="min-w-[6.5rem] font-mono text-xs text-stone-700 tabular-nums">
          {formatClock(current)} / {formatClock(total > 0 ? total : durationSecondsHint ?? 0)}
        </span>
        {!ready && !error ? (
          <span className="text-xs text-stone-500">Indlæser lyd…</span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={0.1}
          value={Math.min(current, sliderMax)}
          onChange={(e) => seekTo(Number(e.target.value))}
          disabled={!src || !!error}
          className="h-1.5 w-full min-w-0 flex-1 cursor-pointer accent-stone-700 disabled:opacity-40"
          aria-label="Spol i optagelsen"
        />
      </div>
    </div>
  );
}
