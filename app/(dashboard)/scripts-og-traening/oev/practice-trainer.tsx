"use client";

/**
 * Øv indvendinger: kunden siger en rigtig indvending (læst op med browserens danske stemme), sælgeren
 * svarer højt (Soniox skriver med) eller skriver, og får feedback med score og en bedre replik.
 */
import { useRef, useState } from "react";
import { startSonioxStream, SpeakerTranscript, type SonioxStream } from "@/lib/live-coach/soniox-stream";
import type { PracticeFeedback } from "@/lib/live-coach/practice";
import { OBJECTION_LABELS } from "@/lib/scripts-traening/labels";

type Round = { category: string; customerLine: string; agentBefore?: string | null };

function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "da-DK";
    window.speechSynthesis.speak(u);
  } catch {
    /* ingen oplæsning i denne browser */
  }
}

const scoreTone = (s: number) => (s >= 80 ? "text-emerald-700" : s >= 50 ? "text-amber-700" : "text-rose-700");

export function PracticeTrainer() {
  const [round, setRound] = useState<Round | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null);
  const [busy, setBusy] = useState<null | "next" | "grade">(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const stream = useRef<{ soniox: SonioxStream; mic: MediaStream } | null>(null);

  const next = async () => {
    stopRecording();
    setBusy("next");
    setError(null);
    setFeedback(null);
    setAnswer("");
    try {
      const res = await fetch("/api/practice/next", { method: "POST" });
      if (!res.ok) throw new Error();
      const r = (await res.json()) as Round;
      setRound(r);
      speak(r.customerLine);
    } catch {
      setError("Kunne ikke hente en indvending.");
    } finally {
      setBusy(null);
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const res = await fetch("/api/live-coach/session", { method: "POST" });
      if (!res.ok) throw new Error();
      const { agentKey, agentName } = (await res.json()) as { agentKey: string; agentName: string };
      const transcript = new SpeakerTranscript();
      const soniox = await startSonioxStream({
        apiKey: agentKey,
        stream: mic,
        terms: ["Allio", ...agentName.split(/\s+/).slice(0, 1)],
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

  const grade = async () => {
    if (!round || !answer.trim()) return;
    stopRecording();
    setBusy("grade");
    setError(null);
    try {
      const res = await fetch("/api/practice/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...round, answer }),
      });
      if (!res.ok) throw new Error();
      const f = (await res.json()) as PracticeFeedback;
      setFeedback(f);
      setScores((s) => [...s, f.score].slice(-20));
    } catch {
      setError("Kunne ikke vurdere svaret.");
    } finally {
      setBusy(null);
    }
  };

  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h2 className="text-2xl font-semibold text-stone-900">Øv indvendinger</h2>
        <p className="mt-1 text-sm text-stone-500">
          Kunden siger en rigtig indvending fra jeres samtaler. Svar højt eller skriv — og få feedback med det samme.
          {avg !== null ? ` Gennemsnit i dag: ${avg} (${scores.length} øvelser).` : ""}
        </p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
        {round ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              {OBJECTION_LABELS[round.category as keyof typeof OBJECTION_LABELS] ?? round.category}
            </p>
            {round.agentBefore ? <p className="mt-2 text-sm leading-relaxed text-stone-500">Sælgeren: «{round.agentBefore}»</p> : null}
            <p className="mt-2 text-lg leading-relaxed text-stone-900">Kunden: “{round.customerLine}”</p>
            <button type="button" onClick={() => speak(round.customerLine)} className="mt-1 text-xs text-stone-500 hover:text-stone-800">
              🔊 Hør igen
            </button>

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              placeholder="Dit svar…"
              className="mt-4 w-full rounded-xl border border-stone-200 p-3 text-[15px] focus:border-emerald-600 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {recording ? (
                <button type="button" onClick={stopRecording} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white">
                  ■ Stop optagelse
                </button>
              ) : (
                <button type="button" onClick={startRecording} className="rounded-lg px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
                  🎤 Svar højt
                </button>
              )}
              <button
                type="button"
                onClick={grade}
                disabled={!answer.trim() || busy !== null}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                {busy === "grade" ? "Vurderer…" : "Få feedback"}
              </button>
              <button type="button" onClick={next} disabled={busy !== null} className="ml-auto rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
                Ny indvending →
              </button>
            </div>
          </>
        ) : (
          <div className="py-6 text-center">
            <button type="button" onClick={next} disabled={busy !== null} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm text-white">
              {busy === "next" ? "Henter…" : "Start øvelse"}
            </button>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>

      {feedback ? (
        <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <p className={`text-4xl font-semibold tabular-nums ${scoreTone(feedback.score)}`}>{feedback.score}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Godt</p>
              <ul className="mt-1 space-y-1 text-sm text-stone-700">{feedback.good.map((g, i) => <li key={i}>• {g}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Mangler</p>
              <ul className="mt-1 space-y-1 text-sm text-stone-700">{feedback.missing.map((m, i) => <li key={i}>• {m}</li>)}</ul>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Prøv i stedet</p>
            <p className="mt-1 border-l-2 border-emerald-600 pl-3 text-[15px] leading-relaxed text-stone-900">{feedback.betterLine}</p>
            <button type="button" onClick={() => speak(feedback.betterLine)} className="mt-1 text-xs text-stone-500 hover:text-stone-800">
              🔊 Hør den
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
