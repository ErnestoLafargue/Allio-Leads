"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createMonoPlayback,
  isVercelBlobPlaybackUrl,
  playbackSourceForRecording,
  supportsMonoPlayback,
  type MonoPlayback,
} from "@/lib/mono-playback";

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  src: string;
  /** LeadActivityEvent-id — afspilles via same-origin, så dual-track kan mixes. */
  eventId?: string | null;
  /** Fra Telnyx webhook / DB — vises indtil metadata er indlæst */
  durationSecondsHint?: number | null;
  /** visuel variant */
  variant?: "default" | "adminInline";
};

/**
 * Afspiller samtaleoptagelse med tydelig varighed, play/pause og scrub (slider).
 *
 * Dual-track filer (sælger/kunde på hvert sit spor) mixes til stereo i browseren,
 * så begge stemmer kommer i begge højttalere. Selve filen gemmes uændret med 2 spor.
 *
 * `playbackSrc` fryses mens der spilles, så Telnyx-sync/webhook der skifter
 * `recordingUrl` (Telnyx → Blob) ikke genstarter `<audio>` midt i — det
 * blokerede ellers `play()` uden ny bruger-gesture og stoppede efter få sekunder.
 *
 * En vagthund holder øje med, at tiden faktisk går, mens der spilles. Står den stille
 * (mixet suspenderet, hentningen hængt eller forbindelsen tabt), genoptages afspilningen
 * fra samme sted — om nødvendigt uden mix, så lyden aldrig bare stopper.
 */
export function LeadRecordingPlayer({
  src,
  eventId,
  durationSecondsHint,
  variant = "default",
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [overrideSrc, setOverrideSrc] = useState<string | null>(null);
  const resolvedSrc = overrideSrc ?? playbackSourceForRecording(src, eventId);
  const [playbackSrc, setPlaybackSrc] = useState(resolvedSrc);
  const [duration, setDuration] = useState<number | null>(
    typeof durationSecondsHint === "number" && durationSecondsHint > 0
      ? durationSecondsHint
      : null,
  );
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playingRef = useRef(false);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  /** Sat når mixet ikke kunne holdes i gang — afspil derefter uden Web Audio. */
  const [mixFailed, setMixFailed] = useState(false);
  const mixCapable = !mixFailed && supportsMonoPlayback(playbackSrc);
  /** Position der skal fortsættes fra, når <audio> er genindlæst eller udskiftet. */
  const resumeAtRef = useRef<number | null>(null);
  const lastGoodTimeRef = useRef(0);
  const networkRetriesRef = useRef(0);
  /**
   * Same-origin proxy (`/api/.../audio`) kræver session-cookie.
   * `crossOrigin="anonymous"` sender IKKE cookies → 401 → «Kunne ikke indlæse lydfilen».
   * CORS-attributten behøves kun for eksterne Blob-URL'er (Web Audio mix).
   */
  const crossOriginAttr =
    mixCapable && !playbackSrc.startsWith("/") ? ("anonymous" as const) : undefined;
  const mixRef = useRef<MonoPlayback | null>(null);

  const ensureMixedPlayback = useCallback(
    (el: HTMLAudioElement) => {
      if (!mixCapable) return;
      mixRef.current ??= createMonoPlayback();
      mixRef.current.ensure(el);
    },
    [mixCapable],
  );

  const suspendMixedPlayback = useCallback(() => {
    mixRef.current?.suspend();
  }, []);

  useEffect(
    () => () => {
      mixRef.current?.close();
      mixRef.current = null;
    },
    [],
  );

  /** Opdatér intern src kun når der ikke spilles — ellers vent til pause/slut. */
  const pendingSrcRef = useRef<string | null>(null);
  useEffect(() => {
    if (resolvedSrc === playbackSrc) {
      pendingSrcRef.current = null;
      return;
    }
    if (playingRef.current) {
      pendingSrcRef.current = resolvedSrc;
      return;
    }
    pendingSrcRef.current = null;
    setPlaybackSrc(resolvedSrc);
    setError(null);
    setCurrent(0);
    if (typeof durationSecondsHint === "number" && durationSecondsHint > 0) {
      setDuration(durationSecondsHint);
    } else {
      setDuration(null);
    }
  }, [resolvedSrc, playbackSrc, durationSecondsHint]);

  const applyPendingSrc = useCallback(() => {
    const pending = pendingSrcRef.current;
    if (!pending || pending === playbackSrc) return;
    pendingSrcRef.current = null;
    setPlaybackSrc(pending);
    setError(null);
  }, [playbackSrc]);

  const onMeta = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
    setError(null);
    const resumeAt = resumeAtRef.current;
    if (resumeAt != null) {
      resumeAtRef.current = null;
      if (resumeAt > 0) el.currentTime = resumeAt;
      if (el.paused) {
        void el.play().catch(() => setPlaying(false));
      }
    }
  }, []);

  const onTime = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    if (el.currentTime > 0) lastGoodTimeRef.current = el.currentTime;
  }, []);

  /** Genindlæs filen og fortsæt fra `at` (fx efter tabt forbindelse midt i en lang fil). */
  const reloadAt = useCallback((el: HTMLAudioElement, at: number) => {
    resumeAtRef.current = at;
    el.load();
    void el.play().catch(() => {
      /* onMeta forsøger igen, når metadata er hentet */
    });
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
    setCurrent(0);
    const el = audioRef.current;
    if (el) el.currentTime = 0;
    suspendMixedPlayback();
    applyPendingSrc();
  }, [applyPendingSrc, suspendMixedPlayback]);

  const onPause = useCallback(() => {
    const el = audioRef.current;
    // Ignorér midlertidig pause under seek/buffer — kun sync når elementet
    // faktisk er stoppet (ikke ended, som håndteres i onEnded).
    if (el && !el.ended && el.paused) {
      setPlaying(false);
      suspendMixedPlayback();
      applyPendingSrc();
    }
  }, [applyPendingSrc, suspendMixedPlayback]);

  const onPlay = useCallback(() => {
    setPlaying(true);
    setError(null);
    // Afspilning kan også startes uden om knappen (genoptag efter buffer, medietaster) —
    // mixet skal altid køre, ellers står lyden stille.
    mixRef.current?.resume();
  }, []);

  const onCanPlay = useCallback(() => {
    setError(null);
  }, []);

  /** Ved buffer-hug: prøv at genoptage hvis brugeren stadig forventer afspilning. */
  const onWaitingOrStalled = useCallback(() => {
    if (!playingRef.current) return;
    const el = audioRef.current;
    if (!el || el.ended) return;
    window.setTimeout(() => {
      if (!playingRef.current || !audioRef.current) return;
      const a = audioRef.current;
      if (a.paused && !a.ended) {
        void a.play().catch(() => {
          /* autoplay kan fejle — brugeren trykker Afspil igen */
          setPlaying(false);
        });
      }
    }, 250);
  }, []);

  const recoveringRef = useRef(false);
  useEffect(() => {
    recoveringRef.current = false;
    setOverrideSrc(null);
  }, [src, eventId]);

  const onErr = useCallback(() => {
    // Forbindelsen tabt midt i afspilning: hent igen og fortsæt fra samme sted.
    const el = audioRef.current;
    if (el && playingRef.current && lastGoodTimeRef.current > 0 && networkRetriesRef.current < 3) {
      networkRetriesRef.current += 1;
      reloadAt(el, lastGoodTimeRef.current);
      return;
    }
    const id = eventId?.trim();
    if (id && isVercelBlobPlaybackUrl(playbackSrc) && !recoveringRef.current) {
      recoveringRef.current = true;
      void (async () => {
        try {
          const res = await fetch(
            `/api/leads/call-recordings/${encodeURIComponent(id)}/audio?resolve=1`,
            { credentials: "same-origin" },
          );
          const data = (await res.json()) as { url?: unknown };
          const url = typeof data.url === "string" ? data.url : "";
          if (res.ok && url && url !== playbackSrc) {
            setOverrideSrc(url);
            setError(null);
            setPlaying(false);
            return;
          }
        } catch {
          /* vis fejlen nedenfor */
        }
        setError("Kunne ikke hente lydfilen.");
        setPlaying(false);
      })();
      return;
    }
    setError("Kunne ikke hente lydfilen.");
    setPlaying(false);
  }, [eventId, playbackSrc, reloadAt]);

  /**
   * Vagthund: mens der spilles, skal tiden gå. Står den stille med data i bufferen, er
   * mixet gået i stå → start det igen, og hjælper det ikke, skift til afspilning uden mix
   * (nyt <audio>, samme position). Står den stille uden data, er hentningen hængt → hent
   * igen fra samme sted.
   */
  useEffect(() => {
    if (!playing) return;
    let lastT = -1;
    let stuckTicks = 0;
    const id = window.setInterval(() => {
      const el = audioRef.current;
      if (!el || el.paused || el.ended || el.seeking) {
        stuckTicks = 0;
        return;
      }
      const t = el.currentTime;
      if (t !== lastT) {
        lastT = t;
        stuckTicks = 0;
        networkRetriesRef.current = 0;
        return;
      }
      stuckTicks += 1;
      if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        if (stuckTicks >= 8) {
          stuckTicks = 0;
          reloadAt(el, t);
        }
        return;
      }
      if (stuckTicks === 2) {
        mixRef.current?.resume();
      } else if (stuckTicks >= 4 && mixRef.current) {
        stuckTicks = 0;
        resumeAtRef.current = t;
        mixRef.current.close();
        mixRef.current = null;
        setMixFailed(true);
      } else if (stuckTicks >= 6) {
        stuckTicks = 0;
        reloadAt(el, t);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, reloadAt]);

  /** Efter skift til afspilning uden mix: det nye <audio> fortsætter, hvor det gamle stod. */
  useEffect(() => {
    if (!mixFailed) return;
    const el = audioRef.current;
    if (!el || resumeAtRef.current == null) return;
    void el.play().catch(() => setPlaying(false));
  }, [mixFailed]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      void el.pause();
      setPlaying(false);
    } else {
      ensureMixedPlayback(el);
      void el.play().then(
        () => setPlaying(true),
        () => setError("Afspilning blev blokeret eller fejlede."),
      );
    }
  }, [playing, ensureMixedPlayback]);

  const seekTo = useCallback(
    (value: number) => {
      const el = audioRef.current;
      if (!el || !Number.isFinite(value)) return;
      const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration ?? 0;
      const t = Math.min(Math.max(0, value), max || 0);
      el.currentTime = t;
      setCurrent(t);
    },
    [duration],
  );

  const total = duration ?? 0;
  const sliderMax = total > 0 ? total : Math.max(current, 1);

  const wrap =
    variant === "adminInline"
      ? "rounded-lg border border-blue-200/90 bg-blue-50/50 p-2"
      : "rounded-lg border border-stone-200 bg-stone-100/60 p-2";

  return (
    <div className={`mt-2 ${wrap}`}>
      <audio
        key={mixCapable ? "mixed" : "native"}
        ref={audioRef}
        src={playbackSrc}
        crossOrigin={crossOriginAttr}
        preload="none"
        className="hidden"
        onLoadedMetadata={onMeta}
        onDurationChange={onMeta}
        onCanPlay={onCanPlay}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onPause={onPause}
        onPlay={onPlay}
        onWaiting={onWaitingOrStalled}
        onStalled={onWaitingOrStalled}
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
          disabled={!playbackSrc || !!error}
          className="inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-md bg-stone-800 px-2.5 text-xs font-semibold text-white shadow-sm hover:bg-stone-900 disabled:opacity-40"
          aria-label={playing ? "Pause" : "Afspil"}
        >
          {playing ? "Pause" : "Afspil"}
        </button>
        <span className="min-w-[6.5rem] font-mono text-xs text-stone-700 tabular-nums">
          {formatClock(current)} / {formatClock(total > 0 ? total : durationSecondsHint ?? 0)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={0.1}
          value={Math.min(current, sliderMax)}
          onChange={(e) => seekTo(Number(e.target.value))}
          disabled={!playbackSrc || !!error}
          className="h-1.5 w-full min-w-0 flex-1 cursor-pointer accent-stone-700 disabled:opacity-40"
          aria-label="Spol i optagelsen"
        />
      </div>
    </div>
  );
}
