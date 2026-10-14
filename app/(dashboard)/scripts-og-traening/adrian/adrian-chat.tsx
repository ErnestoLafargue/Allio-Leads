"use client";

/**
 * Tal med Adrian (AI-mødebookeren): du er kunden og skriver eller taler (Soniox skriver med), Adrian
 * svarer og læses op med browserens danske stemme. Ved hver replik vises Jevs beslutning (label,
 * sikkerhed, bryd ind) og Adrians værktøjskald. Værktøjerne er simulerede: intet bookes rigtigt.
 */
import { useRef, useState } from "react";
import { startSonioxStream, SpeakerTranscript, type SonioxStream } from "@/lib/live-coach/soniox-stream";

type Option = { key: string; label: string };
type Route = { label: string; confidence: number; bargeIn: number; ms: number };
type Turn = { spoken: string; tools: { name: string; input: Record<string, unknown> }[]; hangup: boolean; costUsd: number };
type State = { booked: { dag: string; tid: string; adresse: string } | null; outcome: string | null; notes: string[] };
type Entry =
  | { who: "kunde"; text: string; route: Route | null; jevError: string | null }
  | { who: "adrian"; text: string; tools: Turn["tools"]; ms: number; costUsd: number };

function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\[[^\]]*\]/g, " "));
    u.lang = "da-DK";
    window.speechSynthesis.speak(u);
  } catch {
    /* ingen oplæsning i denne browser */
  }
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function AdrianChat({ playbooks, leads, models }: { playbooks: Option[]; leads: (Option & { answers: string })[]; models: Option[] }) {
  const [approach, setApproach] = useState(playbooks[0]?.key ?? "lavt_pres");
  const [leadKey, setLeadKey] = useState(leads[0]?.key ?? "");
  const [model, setModel] = useState(models[0]?.key ?? "claude-haiku-5-5");
  const [readAloud, setReadAloud] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [agentMsgs, setAgentMsgs] = useState<unknown[]>([]);
  const [state, setState] = useState<State>({ booked: null, outcome: null, notes: [] });
  const [ended, setEnded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const stream = useRef<{ soniox: SonioxStream; mic: MediaStream } | null>(null);
  const started = entries.length > 0;
  const lead = leads.find((l) => l.key === leadKey);
  const cost = entries.reduce((s, e) => s + (e.who === "adrian" ? e.costUsd : 0), 0);

  const send = async (raw: string) => {
    const kunde = raw.trim();
    if (!kunde || busy || ended) return;
    stopRecording();
    setBusy(true);
    setError(null);
    setInput("");
    const lastAgent = [...entries].reverse().find((e) => e.who === "adrian")?.text;
    setEntries((es) => [...es, { who: "kunde", text: kunde, route: null, jevError: null }]);
    try {
      const res = await fetch("/api/ai-saelger/samtale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approach, personaKey: leadKey, model, kunde, sidsteAgentReplik: lastAgent, agentMsgs, state }),
      });
      const data = (await res.json()) as { route: Route | null; jevError: string | null; turn?: Turn; adrianMs?: number; agentMsgs?: unknown[]; state?: State; error?: string };
      setEntries((es) => {
        const copy = [...es];
        copy[copy.length - 1] = { who: "kunde", text: kunde, route: data.route, jevError: data.jevError };
        if (data.turn) copy.push({ who: "adrian", text: data.turn.spoken, tools: data.turn.tools, ms: data.adrianMs ?? 0, costUsd: data.turn.costUsd });
        return copy;
      });
      if (!res.ok || !data.turn) throw new Error(data.error ?? "Adrian kunne ikke svare");
      setAgentMsgs(data.agentMsgs ?? []);
      setState(data.state ?? state);
      if (data.turn.hangup) setEnded(true);
      if (readAloud && data.turn.spoken) speak(data.turn.spoken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      window.speechSynthesis?.cancel();
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const res = await fetch("/api/live-coach/session", { method: "POST" });
      if (!res.ok) throw new Error();
      const { agentKey } = (await res.json()) as { agentKey: string };
      const transcript = new SpeakerTranscript();
      const soniox = await startSonioxStream({
        apiKey: agentKey,
        stream: mic,
        terms: ["Allio", "Adrian", "Victor"],
        onError: (m) => setError(m),
        onTokens: (tokens) => {
          transcript.apply(tokens);
          setInput((transcript.finalText + transcript.interimText).trim());
        },
      });
      stream.current = { soniox, mic };
      setRecording(true);
    } catch {
      setError("Kunne ikke starte mikrofonen.");
    }
  };

  function stopRecording() {
    stream.current?.soniox.stop();
    stream.current?.mic.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setRecording(false);
  }

  const reset = () => {
    stopRecording();
    window.speechSynthesis?.cancel();
    setEntries([]);
    setAgentMsgs([]);
    setState({ booked: null, outcome: null, notes: [] });
    setEnded(false);
    setError(null);
    setInput("");
  };

  const select = "rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-stone-900">Tal med Adrian</h2>
        <p className="mt-1 text-sm text-stone-500">
          Du er kunden. Adrian ringer op; du skriver eller taler, og han svarer. Ved hver replik ser du, hvad routeren (Jev) besluttede.
          Kalender og værktøjer er simulerede: intet bookes eller sendes rigtigt.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <select className={select} value={approach} onChange={(e) => setApproach(e.target.value)} disabled={started}>
          {playbooks.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select className={`${select} max-w-[18rem]`} value={leadKey} onChange={(e) => setLeadKey(e.target.value)} disabled={started}>
          {leads.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
        <select className={select} value={model} onChange={(e) => setModel(e.target.value)} disabled={started}>
          {models.map((m) => <option key={m.key} value={m.key}>Adrian: {m.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> Læs op
        </label>
        {started ? (
          <button type="button" onClick={reset} className="ml-auto rounded-lg px-3 py-1.5 text-sm text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">
            Ny samtale
          </button>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        {!started ? (
          <p className="text-sm text-stone-500">
            Telefonen ringer hos <b>{lead?.label}</b>. Tag den, fx: «{lead?.answers}»
          </p>
        ) : null}
        {entries.map((e, i) =>
          e.who === "kunde" ? (
            <div key={i} className="flex flex-col items-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-stone-100 px-3 py-2 text-[15px] text-stone-900">{e.text}</p>
              <p className="mt-1 text-[11px] text-stone-500">
                {e.route
                  ? `Jev: ${e.route.label} · sikkerhed ${pct(e.route.confidence)} · bryd ind ${pct(e.route.bargeIn)} · ${Math.round(e.route.ms)} ms`
                  : e.jevError
                    ? `Jev fejlede: ${e.jevError}`
                    : busy && i === entries.length - 1
                      ? "Jev og Adrian tænker …"
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
              </p>
              <p className="mt-1 text-[11px] text-stone-500">
                Adrian · {(e.ms / 1000).toFixed(1)} s{" "}
                {e.text ? (
                  <button type="button" onClick={() => speak(e.text)} className="hover:text-stone-800">
                    🔊
                  </button>
                ) : null}
              </p>
            </div>
          ),
        )}

        {state.booked || state.outcome || ended ? (
          <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700 ring-1 ring-stone-200">
            {state.booked ? <p>✅ Møde booket: {state.booked.dag} kl. {state.booked.tid}, {state.booked.adresse}</p> : null}
            {state.outcome ? <p>Udfald: {state.outcome}</p> : null}
            {ended ? <p>Adrian har lagt på.</p> : null}
            {state.notes.length ? <p className="mt-1 text-xs text-stone-500">Noter: {state.notes.join(" · ")}</p> : null}
          </div>
        ) : null}

        {!ended ? (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 pt-1"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder={started ? "Dit svar som kunden …" : lead?.answers}
              className="min-w-0 flex-1 rounded-xl border border-stone-200 p-3 text-[15px] focus:border-emerald-600 focus:outline-none"
            />
            {recording ? (
              <button type="button" onClick={() => void send(input)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white">
                ■ Send
              </button>
            ) : (
              <button type="button" onClick={startRecording} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40">
                🎤
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-40">
              {busy ? "…" : started ? "Send" : "Tag telefonen"}
            </button>
          </form>
        ) : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {started ? <p className="text-right text-[11px] text-stone-400">Pris for Adrian i denne samtale: ${cost.toFixed(3)}</p> : null}
      </section>
    </div>
  );
}
