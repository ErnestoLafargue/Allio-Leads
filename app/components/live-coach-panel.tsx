"use client";

/**
 * Live-coach som sidepanel i højre side. Knappen sidder til højre for udfaldsbjælken; når panelet
 * åbnes, rykker hovedindholdet til venstre, og coachen lytter med på det aktive opkald (klik-for-at-
 * ringe, predictive, power dialer). Lukket panel = ingen lytning og ingen omkostning.
 */
import { useState } from "react";
import { useActiveCallAudio, type CallAudio } from "@/lib/live-coach/call-audio";
import { setLiveCoachOpen, useLiveCoachOpen } from "@/lib/live-coach/panel-state";
import { LiveCoach, type LiveCoachLine } from "./live-coach";

/** Panelets bredde — hovedindholdet får samme margin i højre side. */
const PANEL_WIDTH = "lg:w-[clamp(17rem,22vw,26rem)]";
const MAIN_PADDING = "lg:pr-[calc(clamp(17rem,22vw,26rem)+1.5rem)]";

function CoachIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M19.5 3.5l1 1M21 7h-1.2" />
    </svg>
  );
}

/** Den gennemsigtige knap ved siden af udfaldsbjælken. */
export function LiveCoachToggle() {
  const open = useLiveCoachOpen();
  const call = useActiveCallAudio();
  return (
    <button
      type="button"
      onClick={() => setLiveCoachOpen(!open)}
      aria-pressed={open}
      title={open ? "Luk live-coach" : "Åbn live-coach"}
      className={`flex w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-4 text-xs font-semibold backdrop-blur-sm transition ${
        open
          ? "border-violet-400/70 bg-violet-300/40 text-violet-900 shadow-sm shadow-violet-200"
          : "border-violet-300/60 bg-violet-200/25 text-violet-800 hover:border-violet-400/70 hover:bg-violet-200/45"
      }`}
    >
      <CoachIcon />
      <span>Live-coach</span>
      <span className={`flex items-center gap-1 text-[10px] font-medium ${call ? "text-violet-800" : "text-violet-500"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${call ? "bg-violet-600" : "bg-violet-300"}`} />
        {open ? (call ? "lytter" : "åben") : "lukket"}
      </span>
    </button>
  );
}

/** Hovedindholdet: rykker til venstre, når panelet er åbent. */
export function LiveCoachMain({ children }: { children: React.ReactNode }) {
  const open = useLiveCoachOpen();
  return (
    <main className={`min-h-screen px-4 py-6 transition-[padding] duration-200 lg:pl-[5rem] ${open ? MAIN_PADDING : "lg:pr-6"}`}>
      {children}
    </main>
  );
}

const SPEAKER_LABEL = { agent: "Dig", customer: "Kunde" } as const;

/** Ét opkald: kortet øverst og samtalen som tekst nedenunder (nulstilles ved nyt opkald). */
function ActiveCallCoach({ call }: { call: CallAudio }) {
  const [lines, setLines] = useState<LiveCoachLine[]>([]);
  return (
    <>
      <LiveCoach micStream={call.mic} remoteStream={call.remote} leadId={call.leadId} active bare onTranscript={setLines} />
      <section className="min-h-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Samtalen</p>
        {lines.length ? (
          <ol className="mt-2 space-y-1.5 text-sm">
            {lines.slice(-12).map((l, i) => (
              <li key={i} className={l.final ? "" : "opacity-60"}>
                <span className={`mr-1.5 text-xs font-semibold ${l.speaker === "customer" ? "text-sky-700" : "text-violet-700"}`}>
                  {SPEAKER_LABEL[l.speaker]}:
                </span>
                <span className="text-stone-800">{l.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-stone-400">Teksten kommer her, så snart I taler.</p>
        )}
      </section>
    </>
  );
}

/** Selve panelet i højre side. */
export function LiveCoachPanel() {
  const open = useLiveCoachOpen();
  const call = useActiveCallAudio();
  if (!open) return null;
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-violet-200/80 bg-violet-50/75 shadow-2xl shadow-violet-200/50 backdrop-blur-md ${PANEL_WIDTH}`}
      aria-label="Live-coach"
    >
      <header className="flex items-center justify-between border-b border-violet-200/80 px-4 py-3">
        <div className="flex items-center gap-2 text-stone-800">
          <CoachIcon className="text-violet-700" />
          <span className="text-sm font-semibold">Live-coach</span>
        </div>
        <button
          type="button"
          onClick={() => setLiveCoachOpen(false)}
          className="rounded-lg px-2 py-1 text-lg leading-none text-violet-500 hover:bg-violet-100 hover:text-violet-900"
          aria-label="Luk live-coach"
        >
          ×
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {call ? (
          <ActiveCallCoach key={call.remote.id} call={call} />
        ) : (
          <div className="mt-6 space-y-2 text-center">
            <p className="text-sm font-medium text-stone-700">Venter på et opkald</p>
            <p className="text-xs text-stone-500">
              Ring op som normalt — coachen begynder at lytte, når kunden tager telefonen, og foreslår svar på indvendinger
              undervejs.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
