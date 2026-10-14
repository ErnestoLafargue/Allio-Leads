"use client";

/**
 * Træn Adrian: kunden siger noget (rigtigt citat fra jeres samtaler eller en fast situation), du siger
 * højt, hvordan du ville komme igennem (Soniox skriver med) eller skriver det, og svaret gemmes. Adrian
 * får dine svar i sin systemprompt med det samme. Du kan se, hvad Adrian ville sige nu, og de stærkeste
 * svar fra sælgernes samtaler.
 */
import { useEffect, useRef, useState } from "react";
import { speak, stopSpeaking } from "@/lib/tts/speak-client";
import { startSonioxStream, SpeakerTranscript, type SonioxStream } from "@/lib/live-coach/soniox-stream";

type Option = { key: string; label: string };
type Card = { situation: string; label: string; customerLine: string; agentBefore: string | null; strong: string[] };
type Lesson = { id: string; situation: string; label: string; customerLine: string; answer: string };


export function AdrianTrainer({ situations }: { situations: Option[] }) {
  const [situation, setSituation] = useState("");
  const [card, setCard] = useState<Card | null>(null);
  const [answer, setAnswer] = useState("");
  const [adrian, setAdrian] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [busy, setBusy] = useState<null | "kort" | "adrian" | "gem">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [recording, setRecording] = useState(false);
  const stream = useRef<{ soniox: SonioxStream; mic: MediaStream } | null>(null);

  const loadLessons = async () => {
    const res = await fetch("/api/ai-saelger/traening/lektion");
    if (res.ok) setLessons((await res.json()) as Lesson[]);
  };
  useEffect(() => {
    void loadLessons();
  }, []);

  const next = async () => {
    stopRecording();
    setBusy("kort");
    setError(null);
    setAdrian(null);
    setAnswer("");
    setSaved(false);
    try {
      const res = await fetch("/api/ai-saelger/traening/kort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: situation || undefined }),
      });
      if (!res.ok) throw new Error();
      const c = (await res.json()) as Card;
      setCard(c);
      speak(c.customerLine, "kunde");
    } catch {
      setError("Kunne ikke hente et kort.");
    } finally {
      setBusy(null);
    }
  };

  const askAdrian = async () => {
    if (!card) return;
    setBusy("adrian");
    setError(null);
    try {
      const res = await fetch("/api/ai-saelger/traening/adrian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerLine: card.customerLine, agentBefore: card.agentBefore }),
      });
      const d = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || d.reply === undefined) throw new Error(d.error);
      setAdrian(d.reply);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Adrian kunne ikke svare.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!card || !answer.trim()) return;
    stopRecording();
    setBusy("gem");
    setError(null);
    try {
      const res = await fetch("/api/ai-saelger/traening/lektion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: card.situation, customerLine: card.customerLine, answer }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      await loadLessons();
    } catch {
      setError("Kunne ikke gemme svaret.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/ai-saelger/traening/lektion?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadLessons();
  };

  const startRecording = async () => {
    setError(null);
    try {
      stopSpeaking();
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const res = await fetch("/api/live-coach/session", { method: "POST" });
      if (!res.ok) throw new Error();
      const { agentKey } = (await res.json()) as { agentKey: string };
      const transcript = new SpeakerTranscript();
      const soniox = await startSonioxStream({
        apiKey: agentKey,
        stream: mic,
        terms: ["Allio", "Adrian", "Victor", "mødebooker"],
        onError: (m) => setError(m),
        onTokens: (tokens) => {
          transcript.apply(tokens);
          setAnswer((transcript.finalText + transcript.interimText).trim());
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

  const shown = card ? lessons.filter((l) => l.situation === card.situation) : lessons;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-stone-900">Træn Adrian</h2>
        <p className="mt-1 text-sm text-stone-500">
          Kunden siger noget (rigtige citater fra jeres samtaler). Sig højt, hvordan du ville komme igennem, eller skriv det, og gem.
          Adrian bruger dine svar med det samme, før playbooken og sælgernes svar. {lessons.length ? `${lessons.length} svar indtil nu.` : ""}
        </p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <div className="flex flex-wrap items-center gap-2">
          <select value={situation} onChange={(e) => setSituation(e.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm">
            <option value="">Tilfældig situation</option>
            {situations.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button type="button" onClick={next} disabled={busy !== null} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">
            {busy === "kort" ? "Henter…" : card ? "Næste →" : "Start"}
          </button>
        </div>

        {card ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{card.label}</p>
              {card.agentBefore ? <p className="mt-1 text-sm leading-relaxed text-stone-500">Sælgeren: «{card.agentBefore}»</p> : null}
              <p className="mt-1 text-lg leading-relaxed text-stone-900">Kunden: «{card.customerLine}»</p>
              <button type="button" onClick={() => speak(card.customerLine, "kunde")} className="text-xs text-stone-500 hover:text-stone-800">
                🔊 Hør igen
              </button>
            </div>

            <div>
              <textarea
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setSaved(false);
                }}
                rows={4}
                placeholder="Sådan ville jeg svare …"
                className="w-full rounded-xl border border-stone-200 p-3 text-[15px] focus:border-emerald-600 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {recording ? (
                  <button type="button" onClick={stopRecording} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white">
                    ■ Stop
                  </button>
                ) : (
                  <button type="button" onClick={startRecording} className="rounded-lg px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
                    🎤 Sig det højt
                  </button>
                )}
                <button type="button" onClick={save} disabled={!answer.trim() || busy !== null || saved} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-40">
                  {saved ? "✓ Gemt" : busy === "gem" ? "Gemmer…" : "Gem svaret"}
                </button>
                <button type="button" onClick={askAdrian} disabled={busy !== null} className="ml-auto rounded-lg px-3 py-2 text-sm text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40">
                  {busy === "adrian" ? "Adrian tænker…" : "Hvad ville Adrian sige nu?"}
                </button>
              </div>
            </div>

            {adrian !== null ? (
              <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Adrian nu</p>
                <p className="mt-1 text-[15px] text-stone-900">{adrian || "(siger ingenting)"}</p>
                <button type="button" onClick={() => speak(adrian, "christian-v3c")} className="text-xs text-stone-500 hover:text-stone-800">
                  🔊
                </button>
              </div>
            ) : null}

            {card.strong.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Stærke svar fra jeres samtaler</p>
                <ul className="mt-1 space-y-1 text-sm text-stone-700">
                  {card.strong.map((s, i) => <li key={i}>«{s}»</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      {shown.length ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{card ? `Dine svar: ${card.label}` : "Dine svar"}</p>
          <ul className="mt-2 divide-y divide-stone-100">
            {shown.map((l) => (
              <li key={l.id} className="py-2 text-sm">
                {!card ? <p className="text-[11px] uppercase tracking-wide text-stone-400">{l.label}</p> : null}
                <p className="text-stone-500">Kunden: «{l.customerLine}»</p>
                <p className="text-stone-900">Du: «{l.answer}»</p>
                <button type="button" onClick={() => void remove(l.id)} className="text-xs text-rose-600 hover:text-rose-800">
                  Slet
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
