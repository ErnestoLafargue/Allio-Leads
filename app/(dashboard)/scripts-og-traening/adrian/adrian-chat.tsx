"use client";

/**
 * Tal med Adrian som i telefonen: du trykker «Ring op», mikrofonen er åben hele samtalen, og Soniox
 * mærker, når du holder op med at tale. Så router Jev din replik, Adrian (Claude) svarer, og svaret
 * afspilles med hans rigtige ElevenLabs-stemme. Taler du ind over ham, stopper han. Under hver replik
 * vises svartiden fra du holdt op med at tale til hans første lyd (Jev · Claude · stemme).
 * Kalender og værktøjer er simulerede: intet bookes eller sendes rigtigt.
 */
import { useEffect, useRef, useState } from "react";
import { startSonioxStream, SpeakerTranscript, type SonioxStream } from "@/lib/live-coach/soniox-stream";
import { speak, stopSpeaking } from "@/lib/tts/speak-client";
import { useRouter } from "next/navigation";
import { VoiceRecorder } from "./voice-recorder";

type Option = { key: string; label: string };
type Lead = { kliniknavn: string; by: string; beslutningstager: string; bookingsystem: string; branche: string };
type Route = { label: string; confidence: number; bargeIn: number; ms: number };
type Turn = { spoken: string; tools: { name: string; input: Record<string, unknown> }[]; hangup: boolean; costUsd: number };
type State = { booked: { dag: string; tid: string; adresse: string } | null; outcome: string | null; notes: string[] };
type Entry =
  | { who: "kunde"; text: string; route: Route | null; jevError: string | null }
  | { who: "adrian"; text: string; tools: Turn["tools"]; adrianMs: number; voiceMs: number | null; totalMs: number | null; costUsd: number; interrupted?: boolean };

const DEFAULT_LEAD: Lead = { kliniknavn: "Klinik Lafargue", by: "København", beslutningstager: "Ernesto", bookingsystem: "GeckoBooking", branche: "hudpleje" };
const LEAD_KEY = "tal-med-adrian-lead";
const pct = (x: number) => `${Math.round(x * 100)} %`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

export function AdrianChat({ playbooks, models, voices }: { playbooks: Option[]; models: Option[]; voices: Option[] }) {
  const router = useRouter();
  const [approach, setApproach] = useState(playbooks[0]?.key ?? "lavt_pres");
  const [model, setModel] = useState(models[0]?.key ?? "claude-haiku-5-5");
  const [voice, setVoice] = useState(voices.find((v) => v.key === "christian-v3c")?.key ?? voices[0]?.key ?? "christian-v3c");
  const [lead, setLead] = useState<Lead>(DEFAULT_LEAD);
  const [phase, setPhase] = useState<"klar" | "opkald" | "slut">("klar");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [live, setLive] = useState("");
  const [status, setStatus] = useState("");
  const [state, setState] = useState<State>({ booked: null, outcome: null, notes: [] });
  const [error, setError] = useState<string | null>(null);

  const stream = useRef<{ soniox: SonioxStream; mic: MediaStream } | null>(null);
  const agentMsgs = useRef<unknown[]>([]);
  const toolState = useRef<State>({ booked: null, outcome: null, notes: [] });
  const lastAgent = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const pending = useRef<{ text: string; at: number } | null>(null);
  const speaking = useRef(false);
  const ending = useRef(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LEAD_KEY);
      if (saved) setLead({ ...DEFAULT_LEAD, ...(JSON.parse(saved) as Partial<Lead>) });
    } catch {
      /* ingen lagring */
    }
    return () => hangUp();
  }, []);

  const updateLead = (k: keyof Lead, v: string) => {
    const next = { ...lead, [k]: v };
    setLead(next);
    try {
      localStorage.setItem(LEAD_KEY, JSON.stringify(next));
    } catch {
      /* ingen lagring */
    }
  };

  const sendTurn = async (kunde: string, endedAt: number) => {
    busy.current = true;
    setStatus("Adrian tænker …");
    setEntries((es) => [...es, { who: "kunde", text: kunde, route: null, jevError: null }]);
    try {
      const res = await fetch("/api/ai-saelger/samtale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approach, model, voiceKey: voice, lead, kunde, sidsteAgentReplik: lastAgent.current, agentMsgs: agentMsgs.current, state: toolState.current }),
      });
      const data = (await res.json()) as { route: Route | null; jevError: string | null; turn?: Turn; adrianMs?: number; agentMsgs?: unknown[]; state?: State; error?: string };
      setEntries((es) => {
        const copy = [...es];
        const i = copy.map((e) => e.who).lastIndexOf("kunde");
        if (i >= 0) copy[i] = { who: "kunde", text: kunde, route: data.route, jevError: data.jevError };
        return copy;
      });
      if (!res.ok || !data.turn) throw new Error(data.error ?? "Adrian kunne ikke svare");
      agentMsgs.current = data.agentMsgs ?? [];
      toolState.current = data.state ?? toolState.current;
      setState(toolState.current);
      lastAgent.current = data.turn.spoken;
      const responseAt = performance.now();
      const idx = { n: -1 };
      setEntries((es) => {
        idx.n = es.length;
        return [...es, { who: "adrian", text: data.turn!.spoken, tools: data.turn!.tools, adrianMs: data.adrianMs ?? 0, voiceMs: null, totalMs: null, costUsd: data.turn!.costUsd }];
      });
      const hangup = data.turn.hangup;
      if (data.turn.spoken) {
        speaking.current = true;
        setStatus("Adrian taler …");
        speak(data.turn.spoken, voice, {
          onPlaying: () => {
            const now = performance.now();
            setEntries((es) => es.map((e, i) => (i === idx.n && e.who === "adrian" ? { ...e, voiceMs: now - responseAt, totalMs: now - endedAt } : e)));
          },
          onEnded: () => {
            speaking.current = false;
            setStatus(hangup ? "" : "Din tur");
            if (hangup) endCall();
          },
        });
      } else if (hangup) endCall();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt");
      setStatus("Din tur");
    } finally {
      busy.current = false;
      const next = pending.current;
      pending.current = null;
      if (next && !ending.current) void sendTurn(next.text, next.at);
    }
  };

  const onUtterance = (text: string) => {
    if (ending.current || pausedRef.current) return;
    const at = performance.now();
    if (busy.current) {
      pending.current = { text: pending.current ? `${pending.current.text} ${text}` : text, at };
      return;
    }
    void sendTurn(text, at);
  };

  const call = async () => {
    setError(null);
    setEntries([]);
    setState({ booked: null, outcome: null, notes: [] });
    agentMsgs.current = [];
    toolState.current = { booked: null, outcome: null, notes: [] };
    lastAgent.current = undefined;
    pending.current = null;
    ending.current = false;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const res = await fetch("/api/live-coach/session", { method: "POST" });
      if (!res.ok) throw new Error("Kunne ikke starte talegenkendelsen");
      const { agentKey } = (await res.json()) as { agentKey: string };
      const transcript = new SpeakerTranscript();
      const soniox = await startSonioxStream({
        apiKey: agentKey,
        stream: mic,
        terms: ["Allio", "Adrian", "Victor", "mødebooker", lead.beslutningstager, lead.kliniknavn, lead.bookingsystem],
        onError: (m) => setError(m),
        onTokens: (tokens) => {
          const done = transcript.apply(tokens);
          const now = transcript.utterance;
          setLive(now);
          if (pausedRef.current) return;
          // Du taler ind over Adrian (mere end et «mm»): han stopper.
          if (speaking.current && now.split(/\s+/).filter(Boolean).length >= 2) {
            stopSpeaking();
            speaking.current = false;
            setEntries((es) => es.map((e, i) => (i === es.length - 1 && e.who === "adrian" ? { ...e, interrupted: true } : e)));
          }
          if (done) {
            setLive("");
            onUtterance(done);
          }
        },
      });
      stream.current = { soniox, mic };
      setPhase("opkald");
      setStatus("Det ringer … tag telefonen og sig hej");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke starte mikrofonen");
    }
  };

  function hangUp() {
    stream.current?.soniox.stop();
    stream.current?.mic.getTracks().forEach((t) => t.stop());
    stream.current = null;
    stopSpeaking();
    speaking.current = false;
  }

  function setPause(on: boolean) {
    pausedRef.current = on;
    setPaused(on);
    if (on) {
      stopSpeaking();
      speaking.current = false;
      setLive("");
      setStatus("Pause: Adrian lytter ikke. Giv 👍/👎 og skriv bedre svar, og fortsæt.");
    } else setStatus("Din tur");
  }

  function endCall() {
    ending.current = true;
    hangUp();
    setPhase("slut");
    setStatus("Adrian har lagt på");
    setLive("");
  }

  const cost = entries.reduce((s, e) => s + (e.who === "adrian" ? e.costUsd : 0), 0);
  const field = "rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60";
  const inCall = phase === "opkald";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-stone-900">Tal med Adrian</h2>
        <p className="mt-1 text-sm text-stone-500">
          Adrian ringer til dig. Tryk «Ring op», tag telefonen og tal som en kunde. Han hører, når du holder pause, og svarer med sin rigtige stemme; tal ind over
          ham, så stopper han. Brug gerne headset, så han ikke hører sig selv. Kalender og værktøjer er simulerede.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Din klinik (det Adrian ved fra leadet)</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={field} value={lead.beslutningstager} onChange={(e) => updateLead("beslutningstager", e.target.value)} placeholder="Dit navn" disabled={inCall} />
          <input className={field} value={lead.kliniknavn} onChange={(e) => updateLead("kliniknavn", e.target.value)} placeholder="Klinikkens navn" disabled={inCall} />
          <input className={field} value={lead.by} onChange={(e) => updateLead("by", e.target.value)} placeholder="By" disabled={inCall} />
          <input className={field} value={lead.branche} onChange={(e) => updateLead("branche", e.target.value)} placeholder="Branche" disabled={inCall} />
          <input className={field} value={lead.bookingsystem} onChange={(e) => updateLead("bookingsystem", e.target.value)} placeholder="Bookingsystem" disabled={inCall} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={field} value={approach} onChange={(e) => setApproach(e.target.value)} disabled={inCall}>
            {playbooks.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select className={field} value={model} onChange={(e) => setModel(e.target.value)} disabled={inCall}>
            {models.map((m) => <option key={m.key} value={m.key}>Hjerne: {m.label}</option>)}
          </select>
          <select className={field} value={voice} onChange={(e) => setVoice(e.target.value)} disabled={inCall}>
            {voices.map((v) => <option key={v.key} value={v.key}>Stemme: {v.label}</option>)}
          </select>
          {inCall ? (
            <>
              <button type="button" onClick={() => setPause(!paused)} className="ml-auto rounded-full px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
                {paused ? "▶ Fortsæt" : "⏸ Pause"}
              </button>
              <button type="button" onClick={endCall} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white">
                Læg på
              </button>
            </>
          ) : (
            <button type="button" onClick={call} className="ml-auto rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
              📞 {phase === "slut" ? "Ring op igen" : "Ring op"}
            </button>
          )}
        </div>
      </section>

      {!inCall ? <VoiceRecorder hasVoice={voices.some((v) => v.key === "ernesto-v3c")} onCreated={() => router.refresh()} /> : null}

      {inCall || entries.length ? (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
          {status ? <p className="text-center text-sm font-medium text-stone-600">{status}</p> : null}
          {entries.map((e, i) =>
            e.who === "kunde" ? (
              <div key={i} className="flex flex-col items-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-stone-100 px-3 py-2 text-[15px] text-stone-900">{e.text}</p>
                <p className="mt-1 text-[11px] text-stone-500">
                  {e.route
                    ? `Jev: ${e.route.label} · sikkerhed ${pct(e.route.confidence)} · bryd ind ${pct(e.route.bargeIn)} · ${Math.round(e.route.ms)} ms`
                    : e.jevError
                      ? `Jev fejlede: ${e.jevError}`
                      : ""}
                </p>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-start">
                {e.tools.length ? (
                  <p className="mb-1 text-[11px] text-stone-400">
                    {e.tools.map((t) => `${t.name}${Object.keys(t.input).length ? ` ${JSON.stringify(t.input)}` : ""}`).join(" · ")}
                  </p>
                ) : null}
                <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-emerald-50 px-3 py-2 text-[15px] text-stone-900 ring-1 ring-emerald-100">
                  {e.text || <i className="text-stone-400">(siger ingenting)</i>}
                  {e.interrupted ? <span className="ml-1 text-xs text-rose-600">(afbrudt)</span> : null}
                </p>
                <p className="mt-1 text-[11px] text-stone-500">
                  {e.totalMs !== null
                    ? `Svar efter ${sec(e.totalMs)} fra du holdt op · Claude ${sec(e.adrianMs)} · stemme ${sec(e.voiceMs ?? 0)}`
                    : `Claude ${sec(e.adrianMs)}`}
                </p>
                {e.text ? (
                  <Feedback
                    customerLine={(() => {
                      const prev = entries[i - 1];
                      return prev?.who === "kunde" ? prev.text : "";
                    })()}
                    routerLabel={(() => {
                      const prev = entries[i - 1];
                      return prev?.who === "kunde" ? (prev.route?.label ?? null) : null;
                    })()}
                    context={entries
                      .slice(Math.max(0, i - 5), i - 1)
                      .map((x) => `${x.who === "kunde" ? "Kunden" : "Adrian"}: ${x.text}`)
                      .join("\n")}
                    approach={approach}
                    model={model}
                    answer={e.text}
                    onOpen={() => inCall && !paused && setPause(true)}
                  />
                ) : null}
              </div>
            ),
          )}
          {live ? <p className="text-right text-sm italic text-stone-400">{live} …</p> : null}

          {state.booked || state.outcome || state.notes.length ? (
            <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700 ring-1 ring-stone-200">
              {state.booked ? <p>✅ Møde booket: {state.booked.dag} kl. {state.booked.tid}, {state.booked.adresse}</p> : null}
              {state.outcome ? <p>Udfald: {state.outcome}</p> : null}
              {state.notes.length ? <p className="mt-1 text-xs text-stone-500">Noter: {state.notes.join(" · ")}</p> : null}
            </div>
          ) : null}
          {entries.length ? <p className="text-right text-[11px] text-stone-400">Pris for Adrians hjerne i denne samtale: ${cost.toFixed(3)} (stemmen afregnes hos ElevenLabs)</p> : null}
        </section>
      ) : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <p className="text-[11px] text-stone-400">
        Svartiden måles fra Soniox melder, at du er færdig (ca. 0,5 s efter din sidste lyd), til Adrians første lyd. Han svarer endnu med hele replikken på én
        gang; næste skridt er at streame første sætning til stemmen, mens resten skrives.
      </p>
    </div>
  );
}

/**
 * Feedback på ét svar. 👍: skriv hvorfor det er godt. 👎: skriv hvorfor det er dårligt og et bedre svar.
 * Gemmes som lektion med sammenhæng og Jevs label; Adrian bruger den fra næste replik (relevante
 * lektioner pr. tur), og «Lær af feedback» i «Træn Adrian» gør den til principper.
 */
function Feedback(props: {
  customerLine: string;
  routerLabel: string | null;
  context: string;
  approach: string;
  model: string;
  answer: string;
  onOpen: () => void;
}) {
  const [mode, setMode] = useState<"none" | "op" | "ned" | "gemt-op" | "gemt-ned">("none");
  const [reason, setReason] = useState("");
  const [better, setBetter] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    const up = mode === "op";
    const res = await fetch("/api/ai-saelger/traening/lektion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        situation: "fra_samtale",
        customerLine: props.customerLine || "(Adrian åbner samtalen)",
        answer: up ? props.answer : better.trim(),
        avoidAnswer: up ? undefined : props.answer,
        rating: up ? 1 : -1,
        reason: reason.trim(),
        context: props.context,
        routerLabel: props.routerLabel,
        approach: props.approach,
        model: props.model,
      }),
    });
    if (res.ok) setMode(up ? "gemt-op" : "gemt-ned");
    else setErr("Kunne ikke gemme");
  };

  if (mode === "gemt-op") return <p className="mt-1 text-[11px] text-emerald-700">👍 Gemt med din begrundelse</p>;
  if (mode === "gemt-ned") return <p className="mt-1 text-[11px] text-emerald-700">✓ Gemt; Adrian bruger det fra næste replik</p>;
  if (mode === "op" || mode === "ned") {
    const ready = reason.trim() && (mode === "op" || better.trim());
    return (
      <div className="mt-1 w-full max-w-[85%] space-y-1">
        <textarea
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
          rows={2}
          autoFocus
          placeholder={mode === "op" ? "Hvorfor er svaret godt?" : "Hvorfor er svaret dårligt?"}
          className="w-full rounded-xl border border-stone-200 p-2 text-sm focus:border-emerald-600 focus:outline-none"
        />
        {mode === "ned" ? (
          <textarea
            value={better}
            onChange={(ev) => setBetter(ev.target.value)}
            rows={3}
            placeholder="Sådan skulle han have svaret …"
            className="w-full rounded-xl border border-stone-200 p-2 text-sm focus:border-emerald-600 focus:outline-none"
          />
        ) : null}
        <div className="flex gap-2">
          <button type="button" disabled={!ready} onClick={() => void save()} className="rounded-lg bg-emerald-700 px-3 py-1 text-xs text-white disabled:opacity-40">
            Gem
          </button>
          <button type="button" onClick={() => setMode("none")} className="rounded-lg px-3 py-1 text-xs text-stone-600 hover:bg-stone-100">
            Annullér
          </button>
          {err ? <span className="text-xs text-rose-700">{err}</span> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1 flex gap-1 text-sm">
      <button
        type="button"
        title="Godt svar"
        onClick={() => {
          props.onOpen();
          setMode("op");
        }}
        className="rounded px-1.5 hover:bg-stone-100"
      >
        👍
      </button>
      <button
        type="button"
        title="Dårligt svar"
        onClick={() => {
          props.onOpen();
          setMode("ned");
        }}
        className="rounded px-1.5 hover:bg-stone-100"
      >
        👎
      </button>
    </div>
  );
}
