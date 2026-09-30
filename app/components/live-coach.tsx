"use client";

/**
 * Live-coach: lytter med på sælgerens og kundens lydspor (Soniox realtime direkte fra browseren) og
 * viser ét lille kort — signal, hvad kunden mangler og én replik.
 *  - Lag 1 (straks): indvending genkendt på kundens første ord → jeres bedste svar fra ugens script.
 *  - Lag 2 (~1 s): Claude Haiku tilpasser replikken til samtalen, når kunden er færdig (eller ved en indvending).
 * Tavs, når der ikke er noget at hjælpe med.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { SIGNAL_LABELS } from "@/lib/scripts-traening/labels";
import { startSonioxStream, SpeakerTranscript, type SonioxStream } from "@/lib/live-coach/soniox-stream";
import { detectObjection, triggerCard, type CoachCard } from "@/lib/live-coach/triggers";
import { parseCoachText, type CoachLine } from "@/lib/live-coach/card";

export type LiveCoachLine = CoachLine & { final: boolean };

type Session = { responses: Partial<Record<ObjectionCategory, string>>; agentName: string };

const SIGNAL_STYLE: Record<string, string> = {
  tryghed: "bg-sky-100 text-sky-800",
  klarhed: "bg-violet-100 text-violet-800",
  okonomi: "bg-amber-100 text-amber-800",
  skepsis: "bg-rose-100 text-rose-800",
  timing: "bg-orange-100 text-orange-800",
  lav_interesse: "bg-stone-200 text-stone-700",
};

export function LiveCoach(props: {
  micStream: MediaStream | null;
  remoteStream: MediaStream | null;
  active: boolean;
  /** Valgfrit: vis/brug transskriptionen (fx testsiden). */
  onTranscript?: (lines: LiveCoachLine[]) => void;
  /** Valgfrit: målt tid fra kundens ord til kortet (ms). */
  onLatency?: (ms: number, source: CoachCard["source"]) => void;
}) {
  const { micStream, remoteStream, active, onTranscript, onLatency } = props;
  const [card, setCard] = useState<CoachCard | null>(null);
  const [status, setStatus] = useState<"off" | "starting" | "listening" | "error">("off");
  const [error, setError] = useState<string | null>(null);

  const session = useRef<Session | null>(null);
  const history = useRef<LiveCoachLine[]>([]);
  const agent = useRef(new SpeakerTranscript());
  const customer = useRef(new SpeakerTranscript());
  const customerStart = useRef(0);
  const shownCategory = useRef<ObjectionCategory | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const publish = useCallback(() => {
    if (!onTranscript) return;
    const live: LiveCoachLine[] = [];
    if (agent.current.utterance) live.push({ speaker: "agent", text: agent.current.utterance, final: false });
    if (customer.current.utterance) live.push({ speaker: "customer", text: customer.current.utterance, final: false });
    onTranscript([...history.current, ...live]);
  }, [onTranscript]);

  const askClaude = useCallback(
    async (trigger: ObjectionCategory | null, heardAt: number) => {
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      const lines: CoachLine[] = history.current.map(({ speaker, text }) => ({ speaker, text }));
      if (customer.current.utterance) lines.push({ speaker: "customer", text: customer.current.utterance });
      try {
        const res = await fetch("/api/live-coach/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, trigger }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        let measured = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          const parsed = parseCoachText(text);
          if (parsed.silent || !parsed.line) continue;
          if (!measured) {
            measured = true;
            onLatency?.(performance.now() - heardAt, "ai");
          }
          setCard({ source: "ai", category: trigger, signal: parsed.signal ?? "klarhed", why: parsed.why, line: parsed.line });
        }
      } catch {
        /* afbrudt af et nyere kort */
      }
    },
    [onLatency],
  );

  useEffect(() => {
    if (!active || !remoteStream) return;
    let cancelled = false;
    const streams: SonioxStream[] = [];
    history.current = [];
    agent.current = new SpeakerTranscript();
    customer.current = new SpeakerTranscript();
    shownCategory.current = null;
    setCard(null);
    setError(null);
    setStatus("starting");

    (async () => {
      const res = await fetch("/api/live-coach/session", { method: "POST" });
      if (!res.ok) throw new Error("Kunne ikke starte live-coachen");
      const data = (await res.json()) as Session & { agentKey: string; customerKey: string };
      if (cancelled) return;
      session.current = { responses: data.responses, agentName: data.agentName };
      const terms = ["Allio", ...data.agentName.split(/\s+/).slice(0, 1)];

      const customerStream = await startSonioxStream({
        apiKey: data.customerKey,
        stream: remoteStream,
        terms,
        onError: (m) => setError(m),
        onTokens: (tokens) => {
          const completed = customer.current.apply(tokens);
          const heardAt = customerStart.current + customer.current.lastEndMs;
          const trigger = detectObjection(completed ?? customer.current.utterance);
          if (trigger && trigger.category !== shownCategory.current) {
            shownCategory.current = trigger.category;
            const instant = triggerCard(trigger, session.current?.responses ?? {});
            if (instant) {
              setCard(instant);
              onLatency?.(performance.now() - heardAt, "trigger");
            }
            void askClaude(trigger.category, heardAt);
          }
          if (completed) {
            history.current.push({ speaker: "customer", text: completed, final: true });
            if (!trigger) void askClaude(null, heardAt);
            shownCategory.current = null;
          }
          publish();
        },
      });
      customerStart.current = customerStream.startedAt;
      streams.push(customerStream);

      if (micStream) {
        streams.push(
          await startSonioxStream({
            apiKey: data.agentKey,
            stream: micStream,
            terms,
            onError: (m) => setError(m),
            onTokens: (tokens) => {
              const completed = agent.current.apply(tokens);
              if (completed) history.current.push({ speaker: "agent", text: completed, final: true });
              publish();
            },
          }),
        );
      }
      if (cancelled) streams.forEach((s) => s.stop());
      else setStatus("listening");
    })().catch((err: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
      inFlight.current?.abort();
      streams.forEach((s) => s.stop());
      setStatus("off");
    };
  }, [active, micStream, remoteStream, askClaude, publish, onLatency]);

  if (!active) return null;
  return (
    <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-stone-500">
        <span>Live-coach</span>
        <span>{status === "listening" ? "● lytter" : status === "starting" ? "starter…" : status === "error" ? "fejl" : ""}</span>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
      {card ? (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SIGNAL_STYLE[card.signal] ?? "bg-stone-100 text-stone-700"}`}>
              {SIGNAL_LABELS[card.signal].toUpperCase()}
            </span>
            <span className="text-xs text-stone-600">{card.why}</span>
          </div>
          <p className="text-sm font-medium text-stone-900">“{card.line}”</p>
          <p className="text-[10px] text-stone-400">{card.source === "trigger" ? "fra ugens script" : "tilpasset af AI"}</p>
        </div>
      ) : status === "listening" ? (
        <p className="mt-2 text-xs text-stone-400">Følg scriptet — coachen melder sig, når kunden har brug for noget.</p>
      ) : null}
    </div>
  );
}
