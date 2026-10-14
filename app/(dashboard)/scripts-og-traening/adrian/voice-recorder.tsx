"use client";

/**
 * Optag Ernestos stemme (1–2 minutter, headset-mikrofon) og lav en ElevenLabs-klon af den. Bagefter kan
 * Adrian tale med stemmen «Ernesto» i «Tal med Adrian».
 */
import { useRef, useState } from "react";

const POINTS = [
  "Præsentér dig, som når du ringer: «Hej, det er Ernesto fra Allio …»",
  "Forklar kort, hvad Allio gør for en klinik (inaktive kunder, ubesvarede opkald).",
  "Tag en indvending: «Send mig en mail» eller «vi har travlt».",
  "Foreslå et møde: «Passer torsdag eller fredag bedst?»",
  "Grin gerne, sig «øh» og tal i dit normale tempo. Ikke oplæsning.",
];

export function VoiceRecorder({ hasVoice, onCreated }: { hasVoice: boolean; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; timer: ReturnType<typeof setInterval> } | null>(null);

  const start = async () => {
    setMsg(null);
    setBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => setBlob(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
      mr.start(1000);
      setSeconds(0);
      const t0 = Date.now();
      const timer = setInterval(() => setSeconds(Math.round((Date.now() - t0) / 1000)), 500);
      rec.current = { mr, stream, timer };
      setRecording(true);
    } catch {
      setMsg("Kunne ikke starte mikrofonen.");
    }
  };

  const stop = () => {
    if (!rec.current) return;
    clearInterval(rec.current.timer);
    rec.current.mr.stop();
    rec.current.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setRecording(false);
  };

  const upload = async () => {
    if (!blob) return;
    setBusy(true);
    setMsg("ElevenLabs laver din stemme …");
    try {
      const fd = new FormData();
      fd.append("lyd", blob, blob.type.includes("mp4") ? "ernesto.m4a" : "ernesto.webm");
      fd.append("sekunder", String(seconds));
      const res = await fetch("/api/ai-saelger/stemme", { method: "POST", body: fd });
      const d = (await res.json()) as { voiceId?: string; error?: string };
      if (!res.ok || !d.voiceId) throw new Error(d.error ?? "Det mislykkedes");
      setMsg("✓ Din stemme er klar. Vælg «Stemme: Ernesto» og ring op.");
      setBlob(null);
      onCreated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Det mislykkedes");
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-stone-500 underline hover:text-stone-800">
        {hasVoice ? "Optag din stemme igen" : "🎙 Optag din egen stemme (Ernesto), så Adrian kan tale med den"}
      </button>
    );

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <p className="text-sm font-medium text-stone-900">Optag din stemme (1–2 minutter, gerne med headset i et stille rum)</p>
      <ul className="list-disc pl-5 text-sm text-stone-600">
        {POINTS.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white">
            ■ Stop ({seconds} s)
          </button>
        ) : (
          <button type="button" onClick={start} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-stone-700 ring-1 ring-stone-300 hover:bg-white disabled:opacity-40">
            🎙 {blob ? "Optag igen" : "Start optagelse"}
          </button>
        )}
        {blob && !recording ? (
          <>
            <audio controls src={URL.createObjectURL(blob)} className="h-8" />
            <button type="button" onClick={upload} disabled={busy || seconds < 45} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">
              {busy ? "Laver stemmen …" : seconds < 45 ? `Mindst 45 s (${seconds} s)` : "Lav min stemme"}
            </button>
          </>
        ) : null}
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-xs text-stone-500">
          Luk
        </button>
      </div>
      {msg ? <p className="text-sm text-stone-700">{msg}</p> : null}
    </div>
  );
}
