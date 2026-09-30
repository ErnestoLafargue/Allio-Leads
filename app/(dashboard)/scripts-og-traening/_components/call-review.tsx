"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoredCallAnalysis } from "@/lib/call-analysis/schema";
import type { TranscriptSegment } from "@/lib/call-transcription/segments";
import { createMonoPlayback, supportsMonoPlayback, type MonoPlayback } from "@/lib/mono-playback";
import {
  MOMENT_STYLE,
  OBJECTION_LABELS,
  PHASE_LABELS,
  QUALITY_LABELS,
  QUALITY_STYLE,
  SIGNAL_LABELS,
  clock,
} from "@/lib/scripts-traening/labels";

type Props = {
  audioSrc: string;
  initialT: number | null;
  segments: TranscriptSegment[];
  analysis: StoredCallAnalysis | null;
};

const SPEAKER = {
  agent: { label: "Sælger", bubble: "bg-stone-900 text-white", align: "justify-end" },
  customer: { label: "Kunde", bubble: "bg-white text-stone-900 ring-1 ring-stone-200", align: "justify-start" },
  unknown: { label: "Ukendt", bubble: "bg-stone-100 text-stone-700", align: "justify-start" },
} as const;

function TimeChip({ t, onSeek }: { t: number; onSeek: (t: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSeek(t)}
      className="inline-flex items-center gap-1 rounded-md bg-stone-900/5 px-1.5 py-0.5 font-mono text-[11px] text-stone-700 hover:bg-stone-900/10"
      title="Afspil herfra"
    >
      ▶ {clock(t)}
    </button>
  );
}

export function CallReview({ audioSrc, initialT, segments, analysis }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const monoRef = useRef<MonoPlayback | null>(null);
  const initialApplied = useRef(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mono = supportsMonoPlayback(audioSrc);

  useEffect(() => () => monoRef.current?.close(), []);

  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (mono) {
      monoRef.current ??= createMonoPlayback();
      monoRef.current.ensure(el);
    }
    void el.play().catch(() => setError("Afspilningen blev blokeret — tryk på Afspil."));
  }, [mono]);

  const seek = useCallback(
    (t: number) => {
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, t - 1);
      play();
    },
    [play],
  );

  const highlighted = useMemo(() => {
    const map = new Map<number, keyof typeof MOMENT_STYLE>();
    for (const m of analysis?.moments ?? []) map.set(m.evidence.seg, m.kind);
    return map;
  }, [analysis]);

  const activeSeg = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) if (segments[i]!.start <= current + 0.05) return i;
    return -1;
  }, [segments, current]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-4">
        <div className="sticky top-2 z-10 rounded-xl border border-stone-200/90 bg-white p-3 shadow-sm">
          <audio
            ref={audioRef}
            src={audioSrc}
            crossOrigin={mono ? "anonymous" : undefined}
            preload="metadata"
            className="hidden"
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
              if (initialT !== null && !initialApplied.current) {
                initialApplied.current = true;
                e.currentTarget.currentTime = Math.max(0, initialT - 1);
              }
            }}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onPlay={() => {
              setPlaying(true);
              setError(null);
            }}
            onPause={() => {
              setPlaying(false);
              monoRef.current?.suspend();
            }}
            onError={() => setError("Kunne ikke indlæse lyden.")}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (playing ? audioRef.current?.pause() : play())}
              className="inline-flex h-9 min-w-[5rem] items-center justify-center rounded-md bg-stone-900 px-3 text-sm font-semibold text-white hover:bg-stone-800"
            >
              {playing ? "Pause" : "Afspil"}
            </button>
            <span className="font-mono text-xs tabular-nums text-stone-600">
              {clock(current)} / {clock(duration)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={Math.min(current, Math.max(duration, 1))}
              onChange={(e) => {
                const el = audioRef.current;
                if (el) el.currentTime = Number(e.target.value);
              }}
              className="h-1.5 flex-1 cursor-pointer accent-stone-700"
              aria-label="Spol i samtalen"
            />
          </div>
          {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
        </div>

        {analysis ? (
          <>
            <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-stone-900">Øjeblikke</h2>
              {analysis.moments.length === 0 ? (
                <p className="text-sm text-stone-500">Ingen markante øjeblikke i denne samtale.</p>
              ) : (
                <ul className="space-y-2">
                  {analysis.moments
                    .slice()
                    .sort((a, b) => a.evidence.t - b.evidence.t)
                    .map((m, i) => {
                      const style = MOMENT_STYLE[m.kind];
                      return (
                        <li key={i} className={`rounded-lg border-l-4 p-3 ${style.card}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>{style.label}</span>
                            <span className="text-sm font-semibold text-stone-900">{m.title}</span>
                            <TimeChip t={m.evidence.t} onSeek={seek} />
                          </div>
                          <blockquote className="mt-1.5 text-sm italic text-stone-800">“{m.evidence.quote}”</blockquote>
                          <p className="mt-1 text-sm text-stone-700">{m.explanation}</p>
                          {m.betterLine ? (
                            <p className="mt-1.5 rounded-md bg-white/70 px-2 py-1 text-sm text-stone-800">
                              <span className="font-semibold">Prøv i stedet:</span> “{m.betterLine}”
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-stone-900">Samtalens faser</h2>
              <div className="flex flex-wrap gap-2">
                {analysis.phases.map((p) => (
                  <button
                    key={p.phase}
                    type="button"
                    disabled={p.startT === null}
                    onClick={() => p.startT !== null && seek(p.startT)}
                    title={p.note}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 disabled:cursor-default ${
                      p.present && p.quality ? QUALITY_STYLE[p.quality] : QUALITY_STYLE.none
                    }`}
                  >
                    {PHASE_LABELS[p.phase]}
                    <span className="opacity-70">
                      {p.present && p.quality ? QUALITY_LABELS[p.quality] : "mangler"}
                      {p.startT !== null ? ` · ${clock(p.startT)}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-stone-900">Indvendinger</h2>
              {analysis.objections.length === 0 ? (
                <p className="text-sm text-stone-500">Ingen indvendinger.</p>
              ) : (
                <ul className="space-y-3">
                  {analysis.objections.map((o, i) => (
                    <li key={i} className="rounded-lg bg-stone-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-stone-900">{OBJECTION_LABELS[o.category]}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${QUALITY_STYLE[o.handling]}`}>
                          {QUALITY_LABELS[o.handling]}
                        </span>
                        <span className="text-xs text-stone-500">
                          {o.followsPreferredAnswer ? "✓ følger jeres foretrukne svar" : "✗ afviger fra jeres foretrukne svar"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-stone-700">
                        <span className="font-medium">Kunde:</span> “{o.customer.quote}” <TimeChip t={o.customer.t} onSeek={seek} />
                      </p>
                      {o.response ? (
                        <p className="mt-1 text-sm text-stone-700">
                          <span className="font-medium">Svar:</span> “{o.response.quote}” <TimeChip t={o.response.t} onSeek={seek} />
                        </p>
                      ) : null}
                      {o.note ? <p className="mt-1 text-xs text-stone-500">{o.note}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-stone-900">Kundesignaler</h2>
              {analysis.customerSignals.length === 0 ? (
                <p className="text-sm text-stone-500">Ingen tydelige signaler.</p>
              ) : (
                <ul className="space-y-1.5">
                  {analysis.customerSignals.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200">
                        {SIGNAL_LABELS[s.signal]}
                      </span>
                      <span className="italic">“{s.evidence.quote}”</span>
                      <TimeChip t={s.evidence.t} onSeek={seek} />
                      <span className="text-xs text-stone-500">{s.addressedByAgent ? "✓ taget hånd om" : "✗ ikke taget hånd om"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
            Samtalen er transskriberet, men endnu ikke analyseret.
          </p>
        )}
      </div>

      <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-stone-900">Transskription</h2>
        {segments.length === 0 ? (
          <p className="text-sm text-stone-500">Ingen transskription.</p>
        ) : (
          <ol className="space-y-2">
            {segments.map((s, i) => {
              const sp = SPEAKER[s.speaker];
              const mark = highlighted.get(i);
              return (
                <li key={i} className={`flex ${sp.align}`}>
                  <button
                    type="button"
                    onClick={() => seek(s.start)}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-left text-sm transition ${sp.bubble} ${
                      i === activeSeg ? "ring-2 ring-sky-400" : ""
                    } ${mark ? `border-l-4 ${MOMENT_STYLE[mark].card}` : ""} ${mark && s.speaker === "agent" ? "text-stone-900" : ""}`}
                  >
                    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide opacity-60">
                      {sp.label} · {clock(s.start)}
                    </span>
                    {s.text}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
