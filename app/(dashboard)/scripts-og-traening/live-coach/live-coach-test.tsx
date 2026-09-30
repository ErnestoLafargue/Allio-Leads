"use client";

/**
 * Testside for live-coachen: din mikrofon spiller kunden. Sig fx «vi har allerede et bookingsystem»
 * eller «hvad koster det», og se kortet og den målte tid fra ordet til kortet.
 */
import { useCallback, useState } from "react";
import { LiveCoach, type LiveCoachLine } from "@/app/components/live-coach";
import type { CoachCard } from "@/lib/live-coach/triggers";
import { Card } from "../_components/ui";

type Measure = { ms: number; source: CoachCard["source"] };

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export function LiveCoachTest() {
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [lines, setLines] = useState<LiveCoachLine[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      setMic(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
      setLines([]);
      setMeasures([]);
    } catch {
      setError("Kunne ikke få adgang til mikrofonen.");
    }
  };
  const stop = () => {
    mic?.getTracks().forEach((t) => t.stop());
    setMic(null);
  };
  const onLatency = useCallback((ms: number, source: CoachCard["source"]) => {
    setMeasures((m) => [...m, { ms: Math.round(ms), source }].slice(-50));
  }, []);

  const stat = (source: CoachCard["source"]) => {
    const xs = measures.filter((m) => m.source === source).map((m) => m.ms);
    return xs.length ? `sidst ${xs[xs.length - 1]} ms · median ${median(xs)} ms (${xs.length})` : "–";
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <Card title="Test live-coachen">
        <p className="text-sm text-stone-600">
          Din mikrofon spiller <strong>kunden</strong>. Sig fx «vi har allerede et bookingsystem», «hvad koster det» eller «send
          mig noget på mail» — og mål, hvor hurtigt kortet kommer.
        </p>
        <div className="mt-3 flex gap-2">
          {mic ? (
            <button type="button" onClick={stop} className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white">
              Stop
            </button>
          ) : (
            <button type="button" onClick={start} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white">
              Start test
            </button>
          )}
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-stone-500">Straks-kort (ugens script)</dt>
          <dd className="tabular-nums">{stat("trigger")}</dd>
          <dt className="text-stone-500">AI-kort (Claude Haiku)</dt>
          <dd className="tabular-nums">{stat("ai")}</dd>
        </dl>
        <div className="mt-4 max-h-80 space-y-1 overflow-y-auto rounded-lg bg-stone-50 p-2 text-sm">
          {lines.length === 0 ? <p className="text-stone-400">Transskriptionen vises her.</p> : null}
          {lines.map((l, i) => (
            <p key={i} className={l.final ? "text-stone-800" : "text-stone-400"}>
              <span className="font-medium">{l.speaker === "agent" ? "Sælger" : "Kunde"}:</span> {l.text}
            </p>
          ))}
        </div>
      </Card>
      <div>
        <LiveCoach micStream={null} remoteStream={mic} active={mic !== null} onTranscript={setLines} onLatency={onLatency} />
      </div>
    </div>
  );
}
